import type { TimelineSnapshot, TimelineZoomEvent } from "../stores/timeline";
import { computeZoomState } from "./timelinePlayback";
import { calculateScreenPlacement, drawScreenShare, drawWebcam } from "./layoutDrawers";
import { patchBlob } from "./blobHelpers";
import { getPreferredMimeType } from "./getPreferredMimeType";
import { createRenderChunkQueue, type RenderChunkQueue } from "./renderChunkQueue";
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

export interface RenderCompositeOptions {
  frameRate?: number;
  onProgress?: (current: number, end: number) => void;
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
}

export type RenderResult =
  | {
      type: "blob";
      blob: Blob;
      mimeType: string;
    }
  | {
      type: "file";
      filePath: string;
      mimeType: string;
    };

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

const seekVideo = (video: HTMLVideoElement, time: number) =>
  new Promise<void>((resolve, reject) => {
    const clamped = Math.max(0, Math.min(video.duration || time, time));

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to seek video"));
    };

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = clamped;
  });

const metaEnv =
  typeof import.meta !== "undefined"
    ? (import.meta as { env?: { MODE?: string } })
    : undefined;
const isDevMode = (metaEnv?.env?.MODE ?? "development") !== "production";

const debugLog = (...args: unknown[]) => {
  if (!isDevMode) return;
  console.log("[RenderComposite]", ...args);
};

const createVideoElement = (assetUrl: string) => {
  const video = document.createElement("video");
  video.src = assetUrl;
  if (assetUrl.startsWith("blob:")) {
    video.crossOrigin = "anonymous";
  }
  video.playsInline = true;
  video.muted = true;
  // Reduce memory usage by limiting buffering
  video.preload = "metadata";
  // Disable aggressive buffering
  video.setAttribute("disableRemotePlayback", "true");
  return video;
};

const createAudioElement = (assetUrl: string) => {
  const audio = document.createElement("audio");
  audio.src = assetUrl;
  if (assetUrl.startsWith("blob:")) {
    audio.crossOrigin = "anonymous";
  }
  audio.muted = true;
  // Reduce memory usage by limiting buffering
  audio.preload = "metadata";
  return audio;
};

const loadPointerImage = (src?: string | null) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });

type CapturableMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
  webkitCaptureStream?: () => MediaStream;
};

const captureMediaStream = (element: HTMLMediaElement): MediaStream | null => {
  const capturable = element as CapturableMediaElement;
  const captureFn =
    capturable.captureStream ??
    capturable.mozCaptureStream ??
    capturable.webkitCaptureStream;
  if (typeof captureFn === "function") {
    try {
      return captureFn.call(capturable);
    } catch {
      return null;
    }
  }
  return null;
};

export const renderCompositeRecording = async (
  assets: RecordingAssets,
  durationMs: number,
  snapshot: TimelineSnapshot,
  options: RenderCompositeOptions
): Promise<RenderResult> => {
  const screenAsset = assets.screen;
  if (!screenAsset) {
    throw new Error("Screen asset missing for rendering");
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

  const shouldLoadWebcam = options.toggles.showWebcam;

  const webcamUrl = shouldLoadWebcam ? await loadAssetUrl(assets.webcam) : null;
  const webcamVideo = webcamUrl ? createVideoElement(webcamUrl) : null;
  if (webcamVideo) {
    await waitForMetadata(webcamVideo);
  }

  const pointerIconImage = await loadPointerImage(options.pointerIconUrl ?? cursorPackCursor);
  const pointerPressedIconImage = await loadPointerImage(
    options.pointerIconPressedUrl ?? options.pointerIconUrl ?? cursorPackPointer
  );
  const pointerRecords = options.pointerRecords ?? [];

  // Use conservative frame rate to reduce memory usage
  // 30fps is fine for most content, but lower FPS uses significantly less memory
  const frameRate = Math.min(Math.max(options.frameRate ?? 30, 12), 30);
  const canvas = document.createElement("canvas");
  
  // Automatically reduce resolution for very large canvases to save memory
  const targetPixels = options.canvasSize.width * options.canvasSize.height;
  const MAX_PIXELS = 1920 * 1080 * 1.5; // ~3MP max to keep memory reasonable
  let scaleFactor = 1.0;
  
  if (targetPixels > MAX_PIXELS) {
    scaleFactor = Math.sqrt(MAX_PIXELS / targetPixels);
    console.warn(`[Render] Canvas too large (${(targetPixels / 1000000).toFixed(1)}MP), scaling to ${(scaleFactor * 100).toFixed(0)}% to reduce memory`);
  }
  
  canvas.width = Math.round(options.canvasSize.width * scaleFactor);
  canvas.height = Math.round(options.canvasSize.height * scaleFactor);

  const ctx = canvas.getContext("2d", {
    // Hint that we'll read pixels frequently (for MediaRecorder)
    willReadFrequently: false,
    // Don't need alpha for video rendering
    alpha: false,
  });
  if (!ctx) {
    throw new Error("Unable to render: canvas context unavailable");
  }
  
  // Log memory usage if available (Chrome/Edge)
  const logMemory = () => {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      const usedMB = (mem.usedJSHeapSize / 1024 / 1024).toFixed(0);
      const limitMB = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0);
      console.log(`[Render] Memory: ${usedMB}MB / ${limitMB}MB`);
    }
  };
  logMemory();
  debugLog("Render start", {
    durationMs,
    frameRate,
    canvas: { width: canvas.width, height: canvas.height },
  });

  // Track all captured streams for proper cleanup
  const capturedStreams: MediaStream[] = [];
  
  const screenCaptureStream = captureMediaStream(screenVideo);
  if (screenCaptureStream) capturedStreams.push(screenCaptureStream);
  
  const screenShare: Share = {
    id: "composite-screen",
    preview: screenVideo,
    stream: screenCaptureStream,
    width: screenVideo.videoWidth,
    height: screenVideo.videoHeight,
  };

  const webcamCaptureStream = webcamVideo ? captureMediaStream(webcamVideo) : null;
  if (webcamCaptureStream) capturedStreams.push(webcamCaptureStream);
  
  const webcamStateForRender = {
    stream: webcamCaptureStream,
    preview: webcamVideo,
    width: webcamVideo?.videoWidth ?? 0,
    height: webcamVideo?.videoHeight ?? 0,
  };

  const drawArgs: DrawArgs = {
    ctx,
    theme: options.theme,
    // Use scaled canvas size
    canvasSize: { 
      title: options.canvasSize.title,
      width: canvas.width, 
      height: canvas.height 
    },
    activeShare: screenShare,
    webcamState: webcamStateForRender,
    micAnalyzer: null,
    generalLayoutState: options.generalLayoutState,
    webcamLayoutState: options.webcamLayoutState,
    screenLayoutState: options.screenLayoutState,
  };

  const trimStart = Math.max(0, snapshot.trimStart);
  const trimEnd = Math.min(snapshot.trimEnd ?? durationMs / 1000, durationMs / 1000);
  const effectiveDurationSec = Math.max(0.1, trimEnd - trimStart || durationMs / 1000 || 0.1);
  const effectiveDurationMs = Math.round(effectiveDurationSec * 1000);
  const zoomEvents = ensureZoomEvents(snapshot.events);

  await Promise.all([
    seekVideo(screenVideo, trimStart),
    webcamVideo ? seekVideo(webcamVideo, trimStart) : Promise.resolve(),
  ]);

  const renderStream = canvas.captureStream(frameRate);
  const audioUrl = options.toggles.includeAudio
    ? await loadAssetUrl(assets.audio)
    : null;
  const audioElement = audioUrl ? createAudioElement(audioUrl) : null;
  let audioTracks: MediaStreamTrack[] = [];

  if (audioElement) {
    await waitForMetadata(audioElement);
    const captureStream = captureMediaStream(audioElement);
    if (captureStream) {
      capturedStreams.push(captureStream);
      captureStream.getAudioTracks().forEach((track) => {
        renderStream.addTrack(track);
        audioTracks.push(track);
      });
      audioElement.play().catch(() => undefined);
    }
  }

  const mime = getPreferredMimeType({ includeAudio: Boolean(audioElement) });
  // Lower bitrate to reduce memory usage (4 Mbps is still high quality)
  const recorder = new MediaRecorder(renderStream, {
    mimeType: mime.mimeType,
    videoBitsPerSecond: 4_000_000,
    // audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  const electronAPI =
    typeof window !== "undefined" ? window.electronAPI ?? null : null;
  const supportsStreaming =
    Boolean(electronAPI?.startRenderStream && electronAPI?.appendRenderChunk);
  let renderFilePath: string | null = null;
  if (supportsStreaming && electronAPI?.startRenderStream) {
    try {
      renderFilePath = await electronAPI.startRenderStream("rendered.webm");
    } catch (error) {
      console.warn("Failed to initialize streaming render", error);
      renderFilePath = null;
    }
  }
  const MAX_PENDING_CHUNKS = 1;
  let skipFrames = 0;
  let chunkQueue: RenderChunkQueue | null = null;

  recorder.ondataavailable = (event) => {
    if (!event.data || event.data.size === 0) return;

    if (renderFilePath && electronAPI?.appendRenderChunk) {
      if (!chunkQueue) {
        chunkQueue = createRenderChunkQueue(async (blob) => {
          const buffer = await blob.arrayBuffer();
          await electronAPI.appendRenderChunk({
            filePath: renderFilePath!,
            buffer,
          });
        });
      }
      chunkQueue.enqueue(event.data);
      debugLog("Chunk queued", {
        queueLength: chunkQueue.queueLength(),
        pending: chunkQueue.pendingCount(),
      });
      return;
    }

    chunks.push(event.data);
  };

  const finalizeRender = async (): Promise<RenderResult> => {
    await chunkQueue?.flush();
    debugLog("Finalizing render", {
      pending: chunkQueue?.pendingCount() ?? 0,
      queueLength: chunkQueue?.queueLength() ?? 0,
      renderFile: Boolean(renderFilePath),
    });

    let rawBlob: Blob;
    if (renderFilePath) {
      if (electronAPI?.patchRenderFile) {
        await electronAPI.patchRenderFile({
          filePath: renderFilePath,
          durationMs: effectiveDurationMs,
        });
      }
      debugLog("Finalize returning file", { filePath: renderFilePath });
      return {
        type: "file",
        filePath: renderFilePath,
        mimeType: mime.mimeType,
      };
    } else {
      const blobType = chunks[0]?.type || mime.mimeType;
      rawBlob = new Blob(chunks, { type: blobType });
      (chunks as any).length = 0;
    }

    const patched = await patchBlob(rawBlob, effectiveDurationMs);
    debugLog("Finalize returning blob", { durationMs: effectiveDurationMs, byteLength: patched.size });
    return {
      type: "blob",
      blob: patched,
      mimeType: mime.mimeType,
    };
  };

  const resultPromise = new Promise<RenderResult>((resolve, reject) => {
    recorder.onstop = () => {
      finalizeRender().then(resolve).catch((error) => {
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to patch rendered video")
        );
      });
      debugLog("MediaRecorder onstop fired");
    };
    recorder.onerror = (event) => {
      reject((event as any).error ?? new Error("MediaRecorder error"));
      debugLog("MediaRecorder onerror", (event as any).error);
    };
  });

  const maybeRevokeUrl = (url: string | null) => {
    if (url && url.startsWith("blob:")) {
      try { URL.revokeObjectURL(url); } catch {}
    }
  };

  const stopCapture = () => {
    // Stop and clear all video elements
    try { screenVideo.pause(); } catch {}
    try { screenVideo.src = ""; screenVideo.load(); } catch {}
    try { screenVideo.remove(); } catch {}
    
    if (webcamVideo) { 
      try { webcamVideo.pause(); webcamVideo.src = ""; webcamVideo.load(); } catch {}
      try { webcamVideo.remove(); } catch {}
    }
    
    if (audioElement) {
      try { audioElement.pause(); audioElement.src = ""; audioElement.load(); } catch {}
      try { audioElement.remove(); } catch {}
    }
    
    // Stop all captured streams from video/audio elements
    try {
      capturedStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      });
      capturedStreams.length = 0;
    } catch {}
    
    // Stop render stream tracks
    try { renderStream.getTracks().forEach((track) => track.stop()); } catch {}
    try { audioTracks.forEach((track) => track.stop()); } catch {}
    audioTracks.length = 0;
    
    // Clear canvas to release resources
    try {
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.width = 0;
      canvas.height = 0;
    } catch {}

    // Revoke blob URLs
    maybeRevokeUrl(screenUrl);
    maybeRevokeUrl(webcamUrl);
    maybeRevokeUrl(audioUrl);
    
    // Clear MediaRecorder event handlers to prevent memory leaks
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
  };

  // Flush chunks more frequently to reduce memory buffering (100ms vs 250ms)
  const RECORDER_TIMESLICE_MS = 100;
  recorder.start(RECORDER_TIMESLICE_MS);

  const { onProgress, background, toggles } = options;
  let stopped = false;
  let animationId: number;

  const drawFrame = () => {
    if (stopped) return;

    // Implement backpressure when too many chunks are pending
    const pendingChunks = chunkQueue?.pendingCount() ?? 0;
    if (pendingChunks >= MAX_PENDING_CHUNKS) {
      skipFrames++;
      // Skip rendering this frame but still schedule next frame
      animationId = requestAnimationFrame(drawFrame);
      return;
    }
   
    // Reset skip counter when we're caught up
    if (skipFrames > 0 && pendingChunks === 0) {
      skipFrames = 0;
    }

    const current = screenVideo.currentTime;
    if (current >= trimEnd || screenVideo.ended) {
      debugLog("DrawFrame stopping", { current, trimEnd, ended: screenVideo.ended });
      onProgress?.(trimEnd, trimEnd);
      stopLoop();
      return;
    }

    const { scale, focusX, focusY } = computeZoomState(zoomEvents, current);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Use lower quality when skipping frames to save memory
    ctx.imageSmoothingQuality = skipFrames > 10 ? "medium" : "high";
    ctx.globalCompositeOperation = "source-over";

    // Zoom and draw screen only
    ctx.save();
    const pivotX = focusX * canvas.width;
    const pivotY = focusY * canvas.height;
    ctx.translate(pivotX, pivotY);
    ctx.scale(scale, scale);
    ctx.translate(-pivotX, -pivotY);
    if (toggles.showScreen) {
      drawScreenShare(drawArgs);
    }
    ctx.restore();

    // Draw pointer overlay without zoom
    if (toggles.showMouse && pointerIconImage && pointerRecords.length) {
      const placement = calculateScreenPlacement(
        options.canvasSize,
        drawArgs.activeShare,
        options.screenLayoutState,
        options.generalLayoutState
      );
      if (placement) {
        const pointerState = computePointerState(current, pointerRecords);
        if (pointerState.visible) {
          const icon =
            pointerState.isPressed && pointerPressedIconImage
              ? pointerPressedIconImage
              : pointerIconImage;

          if (icon && icon.naturalWidth && icon.naturalHeight) {
            // Slightly enlarge the rendered pointer compared to the base size
            const POINTER_RENDER_SCALE = 3.25;
            const size = (options.pointerSize ?? 18) * POINTER_RENDER_SCALE * scaleFactor;
            const pointerLeft = (placement.x + pointerState.x * placement.width) * scaleFactor;
            const pointerTop = (placement.y + pointerState.y * placement.height) * scaleFactor;
            ctx.drawImage(icon, pointerLeft - size / 2, pointerTop - size / 2, size, size);
          }
        }
      }
    }

    // Draw webcam without zoom
    if (toggles.showWebcam && webcamVideo) {
      drawWebcam(drawArgs);
    }

    // Background behind everything
    ctx.globalCompositeOperation = "destination-over";
    background.draw(drawArgs);
    ctx.globalCompositeOperation = "source-over";

    onProgress?.(current, trimEnd);
    
    // Log memory every 100 frames to track usage
    if (Math.random() < 0.01) { // ~1% of frames
      logMemory();
    }
    
    animationId = requestAnimationFrame(drawFrame);
  };

  const stopLoop = () => {
    if (stopped) return;
    stopped = true;
    debugLog("stopLoop invoked", { recorderState: recorder.state });
    cancelAnimationFrame(animationId);
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
        debugLog("recorder.stop() called");
      } catch (error) {
        debugLog("recorder.stop() threw", error);
      }
    }
  };

  let captureCleanupDone = false;
  const ensureCaptureStopped = () => {
    if (captureCleanupDone) return;
    captureCleanupDone = true;
    stopCapture();
  };

  const handleTimeUpdate = () => {
    if (screenVideo.currentTime >= trimEnd) {
      debugLog("handleTimeUpdate triggered", { current: screenVideo.currentTime, trimEnd });
      stopLoop();
    }
  };

  screenVideo.addEventListener("timeupdate", handleTimeUpdate);

  try {
    await Promise.all([screenVideo.play(), webcamVideo?.play()].map((promise) => promise ?? Promise.resolve()));
  } catch (error) {
    stopLoop();
    // Cancel Electron-side streaming if active
    if (renderFilePath && electronAPI?.cancelRenderStream) {
      electronAPI.cancelRenderStream(renderFilePath).catch(() => {});
    }
    throw error instanceof Error ? error : new Error("Unable to play media for rendering");
  }

  animationId = requestAnimationFrame(drawFrame);

  const result = await resultPromise
    .catch(async (error) => {
      // Cancel Electron-side streaming on error
      if (renderFilePath && electronAPI?.cancelRenderStream) {
        await electronAPI.cancelRenderStream(renderFilePath).catch(() => {});
      }
      throw error;
    })
    .finally(() => {
      screenVideo.removeEventListener("timeupdate", handleTimeUpdate);
      stopLoop();
      ensureCaptureStopped();
      // Help GC drop references
      chunks.length = 0;
      chunkQueue?.reset();
    });

  debugLog("Render promise resolved", result.type);

  return result;
};
