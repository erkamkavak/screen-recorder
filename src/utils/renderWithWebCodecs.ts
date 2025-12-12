import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  EncodedVideoPacketSource,
  EncodedPacket,
} from "mediabunny";
import type { TimelineSnapshot, TimelineZoomEvent } from "../stores/timeline";
import { computeZoomState, mergeZoomEvents } from "./timelinePlayback";
import { calculateScreenPlacement, drawScreenShare, drawWebcam } from "./layoutDrawers";
import type {
  CanvasSize,
  DrawArgs,
  GeneralLayoutState,
  RecordingAssets,
  RecordingAsset,
  ScreenState,
  WebcamLayoutState,
  Theme,
  Background,
  Share,
} from "../stores";
import type { PointerEventRecord } from "../stores";
import { getAssetUrlFromFile } from "./assetStorage";
import { computePointerState } from "./pointerState";
import cursorPackCursor from "../assets/cursors/cutecore-pink-cursor.png?url";
import cursorPackPointer from "../assets/cursors/cutecore-pink-pointer.png?url";

interface RenderToggleConfig {
  showScreen: boolean;
  showWebcam: boolean;
  showMouse: boolean;
  includeAudio: boolean;
}

export interface WebCodecsRenderOptions {
  frameRate?: number;
  onProgress?: (current: number, total: number) => void;
  canvasSize: CanvasSize;
  generalLayoutState: GeneralLayoutState;
  screenLayoutState: ScreenState;
  webcamLayoutState: WebcamLayoutState;
  theme: Theme;
  background: Background;
  toggles: RenderToggleConfig;
  pointerRecords?: PointerEventRecord[];
  pointerIconUrl?: string | null;
  pointerIconPressedUrl?: string | null;
  pointerSize?: number;
  cancelToken?: { cancelled: boolean };
}

export interface WebCodecsRenderResult {
  type: "blob";
  blob: Blob;
  mimeType: string;
  ext: string;
}

const ensureZoomEvents = (events: TimelineSnapshot["events"]): TimelineZoomEvent[] =>
  events.filter((event): event is TimelineZoomEvent => event.type === "zoom");

const waitForMetadata = (media: HTMLMediaElement) =>
  new Promise<void>((resolve, reject) => {
    if (media.readyState >= 1) {
      resolve();
      return;
    }
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to load media metadata"));
    };
    const cleanup = () => {
      media.removeEventListener("loadedmetadata", onLoaded);
      media.removeEventListener("error", onError);
    };
    media.addEventListener("loadedmetadata", onLoaded);
    media.addEventListener("error", onError);
  });

const seekMedia = (media: HTMLMediaElement, time: number) =>
  new Promise<void>((resolve, reject) => {
    const clamped = Math.max(0, Math.min(media.duration || time, time));
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to seek media"));
    };
    const cleanup = () => {
      media.removeEventListener("seeked", onSeeked);
      media.removeEventListener("error", onError);
    };
    media.addEventListener("seeked", onSeeked);
    media.addEventListener("error", onError);
    try {
      media.currentTime = clamped;
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Failed to set media time"));
    }
  });

type RequestVideoFrameCallback = (
  callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
) => number;

const waitForNextVideoFrame = (video: HTMLVideoElement) =>
  new Promise<void>((resolve) => {
    const requestFrame = (video as HTMLVideoElement & {
      requestVideoFrameCallback?: RequestVideoFrameCallback;
    }).requestVideoFrameCallback;
    if (typeof requestFrame !== "function") {
      resolve();
      return;
    }
    requestFrame.call(video, () => resolve());
  });

const captureFrameAt = async (video: HTMLVideoElement, time: number) => {
  await seekMedia(video, time);
  await waitForNextVideoFrame(video);
};

const waitForFrameAtOrAfter = async (video: HTMLVideoElement, targetTime: number) => {
  const duration = video.duration;
  const isNearDuration =
    Number.isFinite(duration) && duration > 0 && targetTime >= duration - 1e-3;
  if (video.ended) {
    return;
  }
  if (isNearDuration) {
    await captureFrameAt(video, Math.min(targetTime, duration || targetTime));
    return;
  }

  if (video.currentTime >= targetTime - 1e-6) {
    return;
  }

  const requestFrame = (video as HTMLVideoElement & {
    requestVideoFrameCallback?: RequestVideoFrameCallback;
  }).requestVideoFrameCallback;
  if (typeof requestFrame !== "function") {
    await captureFrameAt(video, targetTime);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const frameCallback = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (metadata.mediaTime + 1e-6 >= targetTime) {
        resolve();
        return;
      }
      requestFrame.call(video, frameCallback);
    };
    try {
      requestFrame.call(video, frameCallback);
    } catch (error) {
      reject(error);
    }
  });
};

const createVideoElement = (assetUrl: string) => {
  const video = document.createElement("video");
  video.src = assetUrl;
  if (assetUrl.startsWith("blob:")) {
    video.crossOrigin = "anonymous";
  }
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto"; // Preload for faster playback
  return video;
};

const loadPointerImage = (src?: string | null) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/**
 * Check if WebCodecs is available in the browser
 */
export const isWebCodecsAvailable = (): boolean => {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
};

/**
 * Render video using WebCodecs API via Mediabunny for fast, high-quality MP4 output.
 * Seeks to each logical frame time to guarantee the output duration matches the selected range.
 */
export const renderWithWebCodecs = async (
  assets: RecordingAssets,
  durationMs: number,
  snapshot: TimelineSnapshot,
  options: WebCodecsRenderOptions
): Promise<WebCodecsRenderResult> => {
  const screenAsset = assets.screen;
  if (!screenAsset) {
    throw new Error("Screen asset missing for rendering");
  }

  if (!isWebCodecsAvailable()) {
    throw new Error("WebCodecs API is not available in this browser");
  }

  const loadAssetUrl = async (asset?: RecordingAsset | null) => {
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

  const screenVideo = createVideoElement(screenUrl);
  await waitForMetadata(screenVideo);

  const webcamUrl = options.toggles.showWebcam ? await loadAssetUrl(assets.webcam) : null;
  const webcamVideo = webcamUrl ? createVideoElement(webcamUrl) : null;
  if (webcamVideo) {
    await waitForMetadata(webcamVideo);
  }

  const pointerIconImage = await loadPointerImage(options.pointerIconUrl ?? cursorPackCursor);
  const pointerPressedIconImage = await loadPointerImage(
    options.pointerIconPressedUrl ?? options.pointerIconUrl ?? cursorPackPointer
  );
  const pointerRecords = options.pointerRecords ?? [];

  // Use original frame rate - no capping
  const frameRate = options.frameRate ?? 30;

  // Use original canvas dimensions - ensure even numbers for video encoding
  let canvasWidth = Math.round(options.canvasSize.width / 2) * 2;
  let canvasHeight = Math.round(options.canvasSize.height / 2) * 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
  if (!ctx) {
    throw new Error("Unable to render: canvas context unavailable");
  }

  const screenShare: Share = {
    id: "composite-screen",
    preview: screenVideo,
    stream: null,
    width: screenVideo.videoWidth,
    height: screenVideo.videoHeight,
  };

  const webcamStateForRender = {
    stream: null,
    preview: webcamVideo,
    width: webcamVideo?.videoWidth ?? 0,
    height: webcamVideo?.videoHeight ?? 0,
  };

  const scaledCanvasSize: CanvasSize = {
    width: canvasWidth,
    height: canvasHeight,
    title: options.canvasSize.title,
  };

  const drawArgs: DrawArgs = {
    ctx,
    theme: options.theme,
    canvasSize: scaledCanvasSize,
    activeShare: screenShare,
    webcamState: webcamStateForRender,
    micAnalyzer: null,
    generalLayoutState: options.generalLayoutState,
    webcamLayoutState: options.webcamLayoutState,
    screenLayoutState: options.screenLayoutState,
  };

  const { onProgress, background, toggles, cancelToken } = options;

  const trimStart = Math.max(0, snapshot.trimStart);
  const trimEnd = Math.min(snapshot.trimEnd ?? durationMs / 1000, durationMs / 1000);
  const effectiveDurationSec = Math.max(0.1, trimEnd - trimStart);
  const zoomEvents = mergeZoomEvents(ensureZoomEvents(snapshot.events));

  // Calculate total frames

  // Create Mediabunny output with MP4 format
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  // Use CanvasSource for direct canvas encoding
  // NOTE: latencyMode "quality" allows better batching for offline rendering vs "realtime"
  // keyFrameInterval 60 = keyframe every 2s at 30fps (vs 5 = every 0.17s which is very expensive)
  const encoderConfig = {
    codec: "avc" as const,
    bitrate: 4_000_000, // Slightly higher for quality
    bitrateMode: "variable" as const,
    latencyMode: "quality" as const, // Better for offline rendering, allows batching
    contentHint: "detail" as const, // or "motion" - "detail" for screen content
    keyFrameInterval: 60, // Keyframe every 2s at 30fps (was 5 = every 0.17s)
  };
  console.log("[WebCodecs] Encoder config:", encoderConfig);
  const videoSource = new CanvasSource(canvas, encoderConfig);

  output.addVideoTrack(videoSource, { frameRate });

  // Start the output
  await output.start();

  const renderFrameContent = (currentTime: number) => {
    const placement = calculateScreenPlacement(
      scaledCanvasSize,
      drawArgs.activeShare,
      options.screenLayoutState,
      options.generalLayoutState
    );
    const pointerState = computePointerState(currentTime, pointerRecords);
    const pointerHasActivity = placement && pointerState.visible;
    const pointerPivotX = pointerHasActivity ? placement.x + pointerState.x * placement.width : null;
    const pointerPivotY = pointerHasActivity ? placement.y + pointerState.y * placement.height : null;

    const { scale, focusX, focusY } = computeZoomState(zoomEvents, currentTime);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "medium"; // Faster than "high"
    ctx.globalCompositeOperation = "source-over";
    background.draw(drawArgs);

    ctx.save();
    const pivotXNormalized = pointerPivotX !== null && canvas.width > 0
      ? Math.min(Math.max(pointerPivotX / canvas.width, 0), 1)
      : focusX;
    const pivotYNormalized = pointerPivotY !== null && canvas.height > 0
      ? Math.min(Math.max(pointerPivotY / canvas.height, 0), 1)
      : focusY;
    const pivotX = pivotXNormalized * canvas.width;
    const pivotY = pivotYNormalized * canvas.height;
    ctx.translate(pivotX, pivotY);
    ctx.scale(scale, scale);
    ctx.translate(-pivotX, -pivotY);

    if (toggles.showScreen) {
      drawScreenShare(drawArgs);
    }

    if (toggles.showMouse && pointerRecords.length && placement && pointerState.visible) {
      const cursorShape = pointerState.cursorShape || "default";
      const usePointerIcon = cursorShape === "pointer" || pointerState.isPressed;
      const icon = usePointerIcon
        ? pointerPressedIconImage ?? pointerIconImage
        : pointerIconImage;

      const POINTER_RENDER_SCALE = 5;
      const size = (options.pointerSize ?? 18) * POINTER_RENDER_SCALE;
      const pointerLeft = placement.x + pointerState.x * placement.width;
      const pointerTop = placement.y + pointerState.y * placement.height;

      if (icon) {
        ctx.drawImage(icon, pointerLeft - size / 2, pointerTop - Math.floor((2 * size) / 3), size, size);
      }
    }
    ctx.restore();

    if (toggles.showWebcam && webcamVideo) {
      drawWebcam(drawArgs);
    }
  };

  const frameDurationSec = 1 / frameRate;
  const totalFrames = Math.max(1, Math.ceil(effectiveDurationSec * frameRate));
  console.log(`[WebCodecs] Rendering ${totalFrames} frames at ${frameRate}fps, ${canvasWidth}x${canvasHeight}`);
  // const playbackRate = Math.min(4, Math.max(1, frameRate / 15));
  const playbackRate = 1;
  const batchSize = Math.max(4, Math.min(32, Math.ceil(frameRate / 2)));

  const cleanup = () => {
    try {
      screenVideo.pause();
      screenVideo.src = "";
    } catch { }
    if (webcamVideo) {
      try {
        webcamVideo.pause();
        webcamVideo.src = "";
      } catch { }
    }
  };

  const shouldCaptureWebcam = Boolean(webcamVideo && toggles.showWebcam);

  await seekMedia(screenVideo, trimStart);
  if (webcamVideo) {
    await seekMedia(webcamVideo, trimStart);
  }

  screenVideo.playbackRate = playbackRate;
  screenVideo.loop = false;
  try {
    await screenVideo.play().catch(() => { });
  } catch (error) {
    console.warn("[WebCodecs] Screen video play failed", error);
  }

  if (shouldCaptureWebcam && webcamVideo) {
    webcamVideo.playbackRate = playbackRate;
    webcamVideo.loop = false;
    try {
      await webcamVideo.play().catch(() => { });
    } catch (error) {
      console.warn("[WebCodecs] Webcam video play failed", error);
    }
  }

  try {
    let totalWaitMs = 0;
    let totalRenderMs = 0;
    let totalEncodeMs = 0;
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (cancelToken?.cancelled) {
        throw new Error("Render cancelled");
      }
      const frameTime = Math.min(trimEnd, trimStart + frameIndex * frameDurationSec);
      const waitStart = performance.now();
      const framePromises: Promise<void>[] = [waitForFrameAtOrAfter(screenVideo, frameTime)];
      if (shouldCaptureWebcam && webcamVideo) {
        framePromises.push(waitForFrameAtOrAfter(webcamVideo, frameTime));
      }
      await Promise.all(framePromises);
      const waitEnd = performance.now();
      totalWaitMs += waitEnd - waitStart;

      const renderStart = performance.now();
      renderFrameContent(frameTime);
      const renderEnd = performance.now();
      totalRenderMs += renderEnd - renderStart;

      const timestampSec = frameIndex * frameDurationSec;
      const durationSec = frameDurationSec;
      // Only force first frame as a keyframe; subsequent GOPs are managed by encoder config.
      const forceKeyFrame = frameIndex === 0;
      const encodeStart = performance.now();
      await videoSource.add(timestampSec, durationSec, { keyFrame: forceKeyFrame });
      const encodeEnd = performance.now();
      totalEncodeMs += encodeEnd - encodeStart;
      console.log(`[WebCodecs] Frame ${frameIndex + 1} encoded in ${(encodeEnd - encodeStart).toFixed(2)}ms`);

      if (cancelToken?.cancelled) {
        throw new Error("Render cancelled");
      }

      const completedFrames = frameIndex + 1;
      onProgress?.(completedFrames, totalFrames);

      if (frameIndex > 0 && frameIndex % batchSize === 0) {
        await Promise.resolve();
      }
    }

    if (totalFrames > 0) {
      console.log(
        `[WebCodecs] timing summary wait=${totalWaitMs.toFixed(2)}ms (avg ${(totalWaitMs / totalFrames).toFixed(
          2
        )}ms) render=${totalRenderMs.toFixed(2)}ms (avg ${(totalRenderMs / totalFrames).toFixed(2)}ms) encode=${totalEncodeMs.toFixed(
          2
        )}ms (avg ${(totalEncodeMs / totalFrames).toFixed(2)}ms)`
      );
    }

    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    const blob = new Blob([buffer], { type: "video/mp4" });

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

/**
 * Render video using RAW WebCodecs VideoEncoder API for parallel/pipelined encoding.
 * Uses mediabunny only for MP4 muxing via EncodedVideoPacketSource.
 * 
 * Key difference from renderWithWebCodecs: frames are queued to the encoder without awaiting,
 * allowing the encoder to process multiple frames in parallel/pipelined fashion.
 */
export const renderWithRawWebCodecs = async (
  assets: RecordingAssets,
  durationMs: number,
  snapshot: TimelineSnapshot,
  options: WebCodecsRenderOptions
): Promise<WebCodecsRenderResult> => {
  const screenAsset = assets.screen;
  if (!screenAsset) {
    throw new Error("Screen asset missing for rendering");
  }

  if (!isWebCodecsAvailable()) {
    throw new Error("WebCodecs API is not available in this browser");
  }

  const loadAssetUrl = async (asset?: RecordingAsset | null) => {
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

  const screenVideo = createVideoElement(screenUrl);
  await waitForMetadata(screenVideo);

  const webcamUrl = options.toggles.showWebcam ? await loadAssetUrl(assets.webcam) : null;
  const webcamVideo = webcamUrl ? createVideoElement(webcamUrl) : null;
  if (webcamVideo) {
    await waitForMetadata(webcamVideo);
  }

  const pointerIconImage = await loadPointerImage(options.pointerIconUrl ?? cursorPackCursor);
  const pointerPressedIconImage = await loadPointerImage(
    options.pointerIconPressedUrl ?? options.pointerIconUrl ?? cursorPackPointer
  );
  const pointerRecords = options.pointerRecords ?? [];

  const frameRate = options.frameRate ?? 30;
  const canvasWidth = Math.round(options.canvasSize.width / 2) * 2;
  const canvasHeight = Math.round(options.canvasSize.height / 2) * 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
  if (!ctx) {
    throw new Error("Unable to render: canvas context unavailable");
  }

  const screenShare: Share = {
    id: "composite-screen",
    preview: screenVideo,
    stream: null,
    width: screenVideo.videoWidth,
    height: screenVideo.videoHeight,
  };

  const webcamStateForRender = {
    stream: null,
    preview: webcamVideo,
    width: webcamVideo?.videoWidth ?? 0,
    height: webcamVideo?.videoHeight ?? 0,
  };

  const scaledCanvasSize: CanvasSize = {
    width: canvasWidth,
    height: canvasHeight,
    title: options.canvasSize.title,
  };

  const drawArgs: DrawArgs = {
    ctx,
    theme: options.theme,
    canvasSize: scaledCanvasSize,
    activeShare: screenShare,
    webcamState: webcamStateForRender,
    micAnalyzer: null,
    generalLayoutState: options.generalLayoutState,
    webcamLayoutState: options.webcamLayoutState,
    screenLayoutState: options.screenLayoutState,
  };

  const { onProgress, background, toggles, cancelToken } = options;

  const trimStart = Math.max(0, snapshot.trimStart);
  const trimEnd = Math.min(snapshot.trimEnd ?? durationMs / 1000, durationMs / 1000);
  const effectiveDurationSec = Math.max(0.1, trimEnd - trimStart);
  const zoomEvents = mergeZoomEvents(ensureZoomEvents(snapshot.events));

  const frameDurationSec = 1 / frameRate;
  const totalFrames = Math.max(1, Math.ceil(effectiveDurationSec * frameRate));

  console.log(`[RawWebCodecs] Rendering ${totalFrames} frames at ${frameRate}fps, ${canvasWidth}x${canvasHeight}`);

  // Create mediabunny output with EncodedVideoPacketSource for muxing only
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  // Use EncodedVideoPacketSource - we provide pre-encoded packets
  const videoPacketSource = new EncodedVideoPacketSource("avc");
  output.addVideoTrack(videoPacketSource, { frameRate });

  // Collect encoded chunks for later muxing
  const encodedChunks: { chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }[] = [];
  let firstMeta: EncodedVideoChunkMetadata | undefined;
  let encodeErrors: Error[] = [];
  let chunksEncoded = 0;

  // Create raw VideoEncoder
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (!firstMeta && meta?.decoderConfig) {
        firstMeta = meta;
      }
      encodedChunks.push({ chunk, meta });
      chunksEncoded++;
    },
    error: (e) => {
      console.error("[RawWebCodecs] Encoder error:", e);
      encodeErrors.push(e);
    },
  });

  // Choose appropriate AVC profile/level based on resolution
  // AVC levels and max macroblocks (each macroblock = 16x16 pixels):
  // - Level 3.1 (0x1F/31): 3,600 MBs = ~1280x720
  // - Level 4.0 (0x28/40): 8,192 MBs = ~1920x1088
  // - Level 4.2 (0x2A/42): 8,704 MBs = ~1920x1088
  // - Level 5.0 (0x32/50): 22,080 MBs = ~2560x1920
  // - Level 5.1 (0x33/51): 36,864 MBs = ~4096x2304
  // - Level 5.2 (0x34/52): 36,864 MBs = ~4096x2304
  // - Level 6.0 (0x3C/60): 139,264 MBs = ~8192x4320
  const macroblocks = Math.ceil(canvasWidth / 16) * Math.ceil(canvasHeight / 16);

  let avcLevel: string;
  if (macroblocks <= 3600) {
    avcLevel = "1f"; // Level 3.1
  } else if (macroblocks <= 8192) {
    avcLevel = "28"; // Level 4.0
  } else if (macroblocks <= 22080) {
    avcLevel = "32"; // Level 5.0
  } else if (macroblocks <= 36864) {
    avcLevel = "33"; // Level 5.1
  } else {
    avcLevel = "3c"; // Level 6.0 for 8K
  }

  // Use High profile (64) for better compression, especially at high resolutions
  // Format: avc1.PPCCLL where PP=profile, CC=constraints, LL=level
  const avcCodecString = `avc1.6400${avcLevel}`;

  // Scale bitrate based on resolution (pixels relative to 1080p)
  // Using high quality settings:
  // - 1080p: 20 Mbps (YouTube recommends 10-15 for upload, 20 is higher quality)
  // - 4K: ~80 Mbps (YouTube recommends 35-68 for upload)
  // AVC Level 5.1 max is 50 Mbps, Level 5.2 is 62.5 Mbps, Level 6.0 is 240 Mbps
  const pixels = canvasWidth * canvasHeight;
  const pixels1080p = 1920 * 1080;
  const bitrateScale = Math.max(1, pixels / pixels1080p);
  const baseBitrate = 20_000_000; // 20 Mbps base for 1080p (high quality)
  const bitrate = Math.round(baseBitrate * bitrateScale);

  console.log(`[RawWebCodecs] Target bitrate: ${(bitrate / 1_000_000).toFixed(1)} Mbps`);

  const encoderConfig: VideoEncoderConfig = {
    codec: avcCodecString,
    width: canvasWidth,
    height: canvasHeight,
    bitrate,
    bitrateMode: "variable",
    latencyMode: "quality", // Better for offline rendering
    framerate: frameRate,
  };

  console.log(`[RawWebCodecs] Resolution: ${canvasWidth}x${canvasHeight}, macroblocks: ${macroblocks}`);
  console.log("[RawWebCodecs] Encoder config:", encoderConfig);
  encoder.configure(encoderConfig);

  const renderFrameContent = (currentTime: number) => {
    const placement = calculateScreenPlacement(
      scaledCanvasSize,
      drawArgs.activeShare,
      options.screenLayoutState,
      options.generalLayoutState
    );
    const pointerState = computePointerState(currentTime, pointerRecords);
    const pointerHasActivity = placement && pointerState.visible;
    const pointerPivotX = pointerHasActivity ? placement.x + pointerState.x * placement.width : null;
    const pointerPivotY = pointerHasActivity ? placement.y + pointerState.y * placement.height : null;

    const { scale, focusX, focusY } = computeZoomState(zoomEvents, currentTime);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "medium";
    ctx.globalCompositeOperation = "source-over";
    background.draw(drawArgs);

    ctx.save();
    const pivotXNormalized = pointerPivotX !== null && canvas.width > 0
      ? Math.min(Math.max(pointerPivotX / canvas.width, 0), 1)
      : focusX;
    const pivotYNormalized = pointerPivotY !== null && canvas.height > 0
      ? Math.min(Math.max(pointerPivotY / canvas.height, 0), 1)
      : focusY;
    const pivotX = pivotXNormalized * canvas.width;
    const pivotY = pivotYNormalized * canvas.height;
    ctx.translate(pivotX, pivotY);
    ctx.scale(scale, scale);
    ctx.translate(-pivotX, -pivotY);

    if (toggles.showScreen) {
      drawScreenShare(drawArgs);
    }

    if (toggles.showMouse && pointerRecords.length && placement && pointerState.visible) {
      const cursorShape = pointerState.cursorShape || "default";
      const usePointerIcon = cursorShape === "pointer" || pointerState.isPressed;
      const icon = usePointerIcon
        ? pointerPressedIconImage ?? pointerIconImage
        : pointerIconImage;

      const POINTER_RENDER_SCALE = 5;
      const size = (options.pointerSize ?? 18) * POINTER_RENDER_SCALE;
      const pointerLeft = placement.x + pointerState.x * placement.width;
      const pointerTop = placement.y + pointerState.y * placement.height;

      if (icon) {
        ctx.drawImage(icon, pointerLeft - size / 2, pointerTop - Math.floor((2 * size) / 3), size, size);
      }
    }
    ctx.restore();

    if (toggles.showWebcam && webcamVideo) {
      drawWebcam(drawArgs);
    }
  };

  const cleanup = () => {
    try {
      encoder.close();
    } catch { }
    try {
      screenVideo.pause();
      screenVideo.src = "";
    } catch { }
    if (webcamVideo) {
      try {
        webcamVideo.pause();
        webcamVideo.src = "";
      } catch { }
    }
  };

  const shouldCaptureWebcam = Boolean(webcamVideo && toggles.showWebcam);

  await seekMedia(screenVideo, trimStart);
  if (webcamVideo) {
    await seekMedia(webcamVideo, trimStart);
  }

  // Use higher playback rate to speed up frame extraction
  // Most browsers support up to 16x, but 4x is a safe choice for quality
  const playbackRate = 1;
  console.log(`[RawWebCodecs] Using ${playbackRate}x playback rate for faster frame extraction`);

  screenVideo.playbackRate = playbackRate;
  screenVideo.loop = false;
  try {
    await screenVideo.play().catch(() => { });
  } catch (error) {
    console.warn("[RawWebCodecs] Screen video play failed", error);
  }

  if (shouldCaptureWebcam && webcamVideo) {
    webcamVideo.playbackRate = playbackRate;
    webcamVideo.loop = false;
    try {
      await webcamVideo.play().catch(() => { });
    } catch (error) {
      console.warn("[RawWebCodecs] Webcam video play failed", error);
    }
  }

  try {
    let totalWaitMs = 0;
    let totalRenderMs = 0;
    let totalEncodeQueueMs = 0; // Time to queue frames (should be fast now!)

    const startTime = performance.now();
    const keyFrameInterval = 60; // Keyframe every 2 seconds at 30fps

    // Phase 1: Render all frames and queue to encoder (non-blocking)
    console.log("[RawWebCodecs] Phase 1: Rendering and queueing frames...");

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (cancelToken?.cancelled) {
        throw new Error("Render cancelled");
      }

      // Wait for source video to reach the correct time (with timeout)
      const frameTime = Math.min(trimEnd, trimStart + frameIndex * frameDurationSec);
      const waitStart = performance.now();

      // Add timeout to prevent infinite waits at end of video
      const frameWaitTimeout = 2000; // 2 second timeout per frame
      const waitWithTimeout = async (video: HTMLVideoElement, time: number) => {
        // If video has ended or time is past duration, just use current frame
        if (video.ended || (video.duration && time >= video.duration - 0.1)) {
          return;
        }

        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Frame wait timeout')), frameWaitTimeout)
        );

        try {
          await Promise.race([
            waitForFrameAtOrAfter(video, time),
            timeoutPromise
          ]);
        } catch (e) {
          // Timeout or error - just use current frame
          console.warn(`[RawWebCodecs] Frame wait timeout at ${time.toFixed(2)}s, using current frame`);
        }
      };

      try {
        const framePromises: Promise<void>[] = [waitWithTimeout(screenVideo, frameTime)];
        if (shouldCaptureWebcam && webcamVideo) {
          framePromises.push(waitWithTimeout(webcamVideo, frameTime));
        }
        await Promise.all(framePromises);
      } catch (e) {
        console.warn(`[RawWebCodecs] Error waiting for frame ${frameIndex + 1}:`, e);
      }
      totalWaitMs += performance.now() - waitStart;

      // Render frame to canvas
      const renderStart = performance.now();
      renderFrameContent(frameTime);
      totalRenderMs += performance.now() - renderStart;

      // Create VideoFrame from canvas
      const timestampUs = Math.round(frameIndex * frameDurationSec * 1_000_000);
      const durationUs = Math.round(frameDurationSec * 1_000_000);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: durationUs,
      });

      // Queue frame to encoder - NON-BLOCKING!
      const encodeQueueStart = performance.now();
      const isKeyFrame = frameIndex === 0 || (frameIndex % keyFrameInterval === 0);
      encoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close(); // Close immediately after queueing
      totalEncodeQueueMs += performance.now() - encodeQueueStart;

      // Log progress occasionally (more frequent near end)
      const isNearEnd = frameIndex > totalFrames - 20;
      if (frameIndex % 30 === 0 || isNearEnd) {
        console.log(`[RawWebCodecs] Queued frame ${frameIndex + 1}/${totalFrames}, encoder queue size: ${encoder.encodeQueueSize}${isNearEnd ? ' (near end)' : ''}`);
      }

      // Implement backpressure: if encoder queue is too full, wait a bit (with timeout)
      if (encoder.encodeQueueSize > 10) {
        const backpressureStart = performance.now();
        await new Promise<void>(resolve => {
          let attempts = 0;
          const maxAttempts = 100; // ~1.7 seconds at 60fps
          const checkQueue = () => {
            attempts++;
            if (encoder.encodeQueueSize < 5 || attempts > maxAttempts) {
              if (attempts > maxAttempts) {
                console.warn(`[RawWebCodecs] Backpressure timeout after ${attempts} attempts, continuing anyway`);
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

    console.log(`[RawWebCodecs] All ${totalFrames} frames queued successfully`);

    // Phase 2: Flush encoder - wait for all queued frames to be encoded
    console.log("[RawWebCodecs] Phase 2: Flushing encoder...");
    const flushStart = performance.now();
    await encoder.flush();
    const flushTime = performance.now() - flushStart;
    console.log(`[RawWebCodecs] Encoder flushed in ${flushTime.toFixed(2)}ms, got ${encodedChunks.length} chunks`);

    if (encodeErrors.length > 0) {
      throw encodeErrors[0];
    }

    // Phase 3: Mux encoded chunks into MP4
    console.log("[RawWebCodecs] Phase 3: Muxing to MP4...");
    const muxStart = performance.now();

    await output.start();

    // Sort chunks by timestamp (decode order should match presentation order for AVC baseline)
    encodedChunks.sort((a, b) => a.chunk.timestamp - b.chunk.timestamp);

    for (let i = 0; i < encodedChunks.length; i++) {
      const { chunk, meta } = encodedChunks[i];

      // Convert EncodedVideoChunk to mediabunny EncodedPacket
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);

      const packet = new EncodedPacket(
        data,
        chunk.type === "key" ? "key" : "delta",
        chunk.timestamp / 1_000_000, // Convert μs to seconds
        (chunk.duration ?? 0) / 1_000_000 // Convert μs to seconds
      );

      // First packet needs decoder config metadata
      if (i === 0 && firstMeta?.decoderConfig) {
        const config = firstMeta.decoderConfig;
        await videoPacketSource.add(packet, {
          decoderConfig: {
            codec: config.codec,
            codedWidth: config.codedWidth,
            codedHeight: config.codedHeight,
            description: config.description,
            colorSpace: config.colorSpace,
          },
        });
      } else {
        await videoPacketSource.add(packet);
      }
    }

    videoPacketSource.close();
    await output.finalize();

    const muxTime = performance.now() - muxStart;
    const totalTime = performance.now() - startTime;

    console.log(
      `[RawWebCodecs] ========== TIMING SUMMARY ==========\n` +
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

    const buffer = (output.target as BufferTarget).buffer;
    const blob = new Blob([buffer], { type: "video/mp4" });

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
