/**
 * Main render orchestration
 * Coordinates video loading, frame rendering, encoding, and muxing
 */

import { Input, MP4, WEBM, UrlSource, VideoSampleSink } from "mediabunny";
import type { VideoSample } from "mediabunny";

import type {
    RenderOptions,
    RenderResult,
    TimelineSnapshot,
    RecordingAssets,
    Share,
    PointerEventRecord,
} from "./types";
import type { FrameRenderConfig } from "./frameRenderer";
import type { EncodedChunkWithMeta } from "./muxer";

import { createVideoElement, waitForMetadata } from "./videoUtils";
import { createEncoder } from "./encoder";
import { renderFrameContent, loadPointerImage } from "./frameRenderer";
import { muxEncodedChunks } from "./muxer";
import { mergeZoomEvents } from "../timeline/timelinePlayback";
import { getAssetUrlFromFile } from "../backend/assetStorage";

import cursorPackCursor from "../../assets/cursors/cutecore-pink-cursor.png?url";
import cursorPackPointer from "../../assets/cursors/cutecore-pink-pointer.png?url";

/**
 * Check if WebCodecs is available in the browser
 */
export const isWebCodecsAvailable = (): boolean => {
    return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
};

/**
 * Ensure we have a valid array of zoom events
 */
const ensureZoomEvents = (events: TimelineSnapshot["events"]) => {
    return events.filter((e) => e.type === "zoom") as import("../stores/timeline").TimelineZoomEvent[];
};

/**
 * Main render function
 * 
 * Uses a 3-phase approach:
 * 1. Render all frames and queue to encoder (non-blocking)
 * 2. Flush encoder (parallel encoding happens here)
 * 3. Mux encoded chunks into MP4
 */
export const render = async (
    assets: RecordingAssets,
    durationMs: number,
    snapshot: TimelineSnapshot,
    options: RenderOptions
): Promise<RenderResult> => {
    const screenAsset = assets.screen;
    if (!screenAsset) {
        throw new Error("Screen asset missing for rendering");
    }

    if (!isWebCodecsAvailable()) {
        throw new Error("WebCodecs API is not available in this browser");
    }

    // Load asset URLs
    const loadAssetUrl = async (asset?: { filePath: string } | null) => {
        if (!asset) return null;
        try {
            return await getAssetUrlFromFile(asset.filePath);
        } catch (error) {
            console.warn("Unable to load asset for rendering", error);
            return null;
        }
    };

    const screenUrl = await loadAssetUrl(screenAsset);
    if (!screenUrl) {
        throw new Error("Unable to load screen asset for rendering");
    }

    const webcamUrl = options.toggles.showWebcam ? await loadAssetUrl(assets.webcam) : null;

    // Keep lightweight <video> elements only for metadata/preview (not for per-frame extraction)
    const screenVideo = createVideoElement(screenUrl);
    const webcamVideo = webcamUrl ? createVideoElement(webcamUrl) : null;
    await Promise.all([waitForMetadata(screenVideo), webcamVideo ? waitForMetadata(webcamVideo) : Promise.resolve()]);

    // Decode frames via WebCodecs (mediabunny) from file
    const screenInput = new Input({
        formats: [MP4, WEBM],
        source: new UrlSource(screenUrl),
    });
    const webcamInput = webcamUrl
        ? new Input({
              formats: [MP4, WEBM],
              source: new UrlSource(webcamUrl),
          })
        : null;

    const screenTrack = await screenInput.getPrimaryVideoTrack();
    if (!screenTrack) {
        screenInput.dispose();
        webcamInput?.dispose();
        throw new Error("Unable to render: screen asset has no video track");
    }
    const webcamTrack = webcamInput ? await webcamInput.getPrimaryVideoTrack() : null;

    const screenSink = new VideoSampleSink(screenTrack);
    const webcamSink = webcamTrack ? new VideoSampleSink(webcamTrack) : null;

    const createFallbackBitmap = async () => {
        const c = document.createElement("canvas");
        c.width = 2;
        c.height = 2;
        const cctx = c.getContext("2d");
        if (cctx) {
            cctx.fillStyle = "#000";
            cctx.fillRect(0, 0, c.width, c.height);
        }
        return createImageBitmap(c);
    };

    // Load pointer icons
    const pointerIconImage = await loadPointerImage(options.pointerIconUrl ?? cursorPackCursor);
    const pointerPressedIconImage = await loadPointerImage(
        options.pointerIconPressedUrl ?? options.pointerIconUrl ?? cursorPackPointer
    );
    const pointerRecords = options.pointerRecords ?? [];
    const clickRecords = (pointerRecords.filter(
        (event): event is PointerEventRecord => event.kind === "click"
    ) ?? []) as PointerEventRecord[];

    // Setup canvas
    const frameRate = options.frameRate ?? 30;
    const canvasWidth = Math.round(options.canvasSize.width / 2) * 2; // Ensure even dimensions
    const canvasHeight = Math.round(options.canvasSize.height / 2) * 2;

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    if (!ctx) {
        throw new Error("Unable to render: canvas context unavailable");
    }

    // Create screen share object for layout calculations
    const screenShare: Share = {
        id: "composite-screen",
        preview: screenVideo,
        stream: null,
        width: screenVideo.videoWidth,
        height: screenVideo.videoHeight,
    };

    // Prepare frame render config
    const zoomEvents = mergeZoomEvents(ensureZoomEvents(snapshot.events));
    const frameRenderConfig: FrameRenderConfig = {
        ctx,
        canvas,
        canvasSize: { ...options.canvasSize, width: canvasWidth, height: canvasHeight },
        theme: options.theme,
        background: options.background,
        generalLayoutState: options.generalLayoutState,
        screenLayoutState: options.screenLayoutState,
        webcamLayoutState: options.webcamLayoutState,
        screenShare,
        webcamVideo,
        pointerRecords,
        clickRecords,
        pointerIconImage,
        pointerPressedIconImage,
        pointerSize: options.pointerSize ?? 18,
        zoomEvents,
        captions: options.captions,
        toggles: options.toggles,
    };

    // Calculate timing
    const { onProgress, cancelToken } = options;
    const trimStart = Math.max(0, snapshot.trimStart);
    const trimEnd = Math.min(snapshot.trimEnd ?? durationMs / 1000, durationMs / 1000);
    const effectiveDurationSec = Math.max(0.1, trimEnd - trimStart);
    const frameDurationSec = 1 / frameRate;
    const totalFrames = Math.max(1, Math.ceil(effectiveDurationSec * frameRate));
    const keyFrameInterval = 60; // Keyframe every 2 seconds at 30fps

    console.log(`[Render] Starting: ${totalFrames} frames at ${frameRate}fps, ${canvasWidth}x${canvasHeight}`);

    // Setup encoder
    const encodedChunks: EncodedChunkWithMeta[] = [];
    let encodeErrors: Error[] = [];

    const encoder = createEncoder(
        canvasWidth,
        canvasHeight,
        frameRate,
        (chunk, meta) => {
            encodedChunks.push({ chunk, meta });
        },
        (e) => {
            console.error("[Render] Encoder error:", e);
            encodeErrors.push(e);
        }
    );

    // Cleanup function
    const cleanup = () => {
        try {
            encoder.close();
        } catch { }

        try {
            screenInput.dispose();
        } catch { }
        try {
            webcamInput?.dispose();
        } catch { }

        try {
            screenVideo.src = "";
            screenVideo.load();
            screenVideo.remove();
        } catch { }
        if (webcamVideo) {
            try {
                webcamVideo.src = "";
                webcamVideo.load();
                webcamVideo.remove();
            } catch { }
        }
    };

    // Prepare decode iterators (monotonic timestamps => mediabunny optimized path)
    const shouldCaptureWebcam = Boolean(webcamSink && options.toggles.showWebcam);

    try {
        // Timing stats
        let totalWaitMs = 0;
        let totalRenderMs = 0;
        let totalEncodeQueueMs = 0;
        const startTime = performance.now();

        // Phase 1: Render all frames and queue to encoder (non-blocking)
        console.log("[Render] Phase 1: Rendering and queueing frames...");

        const timestampsSec: number[] = Array.from({ length: totalFrames }, (_, frameIndex) =>
            Math.max(trimStart, Math.min(trimEnd, trimStart + frameIndex * frameDurationSec))
        );
        const screenIterator: AsyncIterator<VideoSample | null, void, unknown> =
            screenSink.samplesAtTimestamps(timestampsSec)[Symbol.asyncIterator]();
        const webcamIterator: AsyncIterator<VideoSample | null, void, unknown> | null =
            shouldCaptureWebcam && webcamSink
                ? webcamSink.samplesAtTimestamps(timestampsSec)[Symbol.asyncIterator]()
                : null;

        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
            if (cancelToken?.cancelled) {
                throw new Error("Render cancelled");
            }

            const waitStart = performance.now();
            const decodedTime = timestampsSec[frameIndex];

            const screenNext = await screenIterator.next();
            let screenSample: VideoSample | null;
            if (screenNext.done) {
                screenSample = null;
            } else {
                screenSample = (screenNext.value ?? null) as VideoSample | null;
            }
            const webcamNext = webcamIterator ? await webcamIterator.next() : null;
            let webcamSample: VideoSample | null;
            if (!webcamNext) {
                webcamSample = null;
            } else if (webcamNext.done) {
                webcamSample = null;
            } else {
                webcamSample = (webcamNext.value ?? null) as VideoSample | null;
            }

            let screenBitmap: ImageBitmap;
            let webcamBitmap: ImageBitmap | null = null;
            try {
                if (screenSample) {
                    screenBitmap = await createImageBitmap(screenSample.toCanvasImageSource());
                } else {
                    screenBitmap = await createFallbackBitmap();
                }

                if (shouldCaptureWebcam) {
                    if (webcamSample) {
                        webcamBitmap = await createImageBitmap(webcamSample.toCanvasImageSource());
                    } else {
                        webcamBitmap = await createFallbackBitmap();
                    }
                }
            } finally {
                try {
                    screenSample?.close();
                } catch { }
                try {
                    webcamSample?.close();
                } catch { }
            }

            totalWaitMs += performance.now() - waitStart;

            // Render frame to canvas
            const renderStart = performance.now();
            const frameConfigWithFrames = {
                ...(frameRenderConfig as any),
                screenFrame: screenBitmap,
                webcamFrame: webcamBitmap ?? undefined,
            };
            renderFrameContent(frameConfigWithFrames, decodedTime);
            totalRenderMs += performance.now() - renderStart;

            // Free bitmaps ASAP
            try {
                screenBitmap.close();
            } catch { }
            if (webcamBitmap) {
                try {
                    webcamBitmap.close();
                } catch { }
            }

            // Create VideoFrame from canvas
            const timestampUs = Math.round(frameIndex * frameDurationSec * 1_000_000);
            const durationUs = Math.round(frameDurationSec * 1_000_000);
            const videoFrame = new VideoFrame(canvas, {
                timestamp: timestampUs,
                duration: durationUs,
            });

            // Queue frame to encoder - NON-BLOCKING!
            const encodeQueueStart = performance.now();
            const isKeyFrame = frameIndex === 0 || frameIndex % keyFrameInterval === 0;
            encoder.encode(videoFrame, { keyFrame: isKeyFrame });
            videoFrame.close(); // Close immediately after queueing
            totalEncodeQueueMs += performance.now() - encodeQueueStart;

            // Log progress occasionally (more frequent near end)
            const isNearEnd = frameIndex > totalFrames - 20;
            if (frameIndex % 30 === 0 || isNearEnd) {
                console.log(
                    `[Render] Queued frame ${frameIndex + 1}/${totalFrames}, queue size: ${encoder.encodeQueueSize}${isNearEnd ? " (near end)" : ""}`
                );
            }

            // Implement backpressure: if encoder queue is too full, wait a bit (with timeout)
            if (encoder.encodeQueueSize > 10) {
                await new Promise<void>((resolve) => {
                    let attempts = 0;
                    const maxAttempts = 100; // ~1.7 seconds at 60fps
                    const checkQueue = () => {
                        attempts++;
                        if (encoder.encodeQueueSize < 5 || attempts > maxAttempts) {
                            if (attempts > maxAttempts) {
                                console.warn(`[Render] Backpressure timeout after ${attempts} attempts`);
                            }
                            resolve();
                        } else {
                            requestAnimationFrame(checkQueue);
                        }
                    };
                    checkQueue();
                });
            }

            onProgress?.(frameIndex + 1, totalFrames);
        }

        console.log(`[Render] All ${totalFrames} frames queued successfully`);

        // Phase 2: Flush encoder - wait for all queued frames to be encoded
        console.log("[Render] Phase 2: Flushing encoder...");
        const flushStart = performance.now();
        await encoder.flush();
        const flushTime = performance.now() - flushStart;
        console.log(`[Render] Encoder flushed in ${flushTime.toFixed(2)}ms, got ${encodedChunks.length} chunks`);

        if (encodeErrors.length > 0) {
            throw encodeErrors[0];
        }

        // Phase 3: Mux encoded chunks into MP4
        console.log("[Render] Phase 3: Muxing to MP4...");
        const muxStart = performance.now();
        const blob = await muxEncodedChunks(encodedChunks, frameRate);
        const muxTime = performance.now() - muxStart;

        const totalTime = performance.now() - startTime;

        console.log(
            `[Render] ========== TIMING SUMMARY ==========\n` +
            `  Total time: ${(totalTime / 1000).toFixed(2)}s\n` +
            `  Frames: ${totalFrames} @ ${frameRate}fps\n` +
            `  Phase 1 (Render + Queue):\n` +
            `    Wait: ${totalWaitMs.toFixed(2)}ms total (avg ${(totalWaitMs / totalFrames).toFixed(2)}ms/frame)\n` +
            `    Render: ${totalRenderMs.toFixed(2)}ms total (avg ${(totalRenderMs / totalFrames).toFixed(2)}ms/frame)\n` +
            `    Queue: ${totalEncodeQueueMs.toFixed(2)}ms total (avg ${(totalEncodeQueueMs / totalFrames).toFixed(2)}ms/frame)\n` +
            `  Phase 2 (Flush): ${flushTime.toFixed(2)}ms\n` +
            `  Phase 3 (Mux): ${muxTime.toFixed(2)}ms\n` +
            `  Encoded chunks: ${encodedChunks.length}`
        );

        return {
            type: "blob",
            blob,
            mimeType: "video/mp4",
            ext: "mp4",
        };
    } finally {
        cleanup();
    }
};
