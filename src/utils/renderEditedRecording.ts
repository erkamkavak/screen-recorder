import type { TimelineEvent, TimelineSnapshot, TimelineZoomEvent } from "../stores/timeline";
import { computeZoomState } from "./timelinePlayback";

interface RenderOptions {
  mimeType?: string;
  frameRate?: number;
  onProgress?: (current: number, end: number) => void;
  includeAudio?: boolean;
}

const ensureZoomEvents = (events: TimelineEvent[]): TimelineZoomEvent[] =>
  events.filter((event): event is TimelineZoomEvent => event.type === "zoom");

const waitForMetadata = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) {
      resolve();
      return;
    }

    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to load video metadata"));
    };

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
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

export const renderEditedRecording = async (
  sourceUrl: string,
  duration: number,
  snapshot: TimelineSnapshot,
  options: RenderOptions = {}
): Promise<Blob> => {
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = true;

  await waitForMetadata(video);

  const videoWidth = video.videoWidth || 1280;
  const videoHeight = video.videoHeight || 720;
  const frameRate = options.frameRate ?? 30;
  const mimeType = options.mimeType ?? "video/webm;codecs=vp9";
  const includeAudio = options.includeAudio !== false;

  const canvas = document.createElement("canvas");
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to render edited video: canvas 2D context unavailable");
  }

  const renderStream = canvas.captureStream(frameRate);
  let audioSource: MediaStream | null = null;

  if (includeAudio) {
    const capturable = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
      webkitCaptureStream?: () => MediaStream;
    };
    const captureFn =
      capturable.captureStream ?? capturable.mozCaptureStream ?? capturable.webkitCaptureStream;
    if (typeof captureFn === "function") {
      try {
        audioSource = captureFn.call(capturable);
        audioSource
          .getAudioTracks()
          .forEach((track) => renderStream.addTrack(track));
      } catch (error) {
        console.warn("Failed to capture source audio during render", error);
      }
    }
  }

  const chunks: Blob[] = [];
  let recorder: MediaRecorder;

  try {
    recorder = new MediaRecorder(renderStream, { mimeType });
  } catch (error) {
    renderStream.getTracks().forEach((track) => track.stop());
    audioSource?.getTracks().forEach((track) => track.stop());
    throw error instanceof Error ? error : new Error("Unable to initialise media recorder");
  }

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const resultPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      try {
        const type = recorder.mimeType || mimeType;
        resolve(new Blob(chunks, { type }));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to assemble rendered video"));
      }
    };
    recorder.onerror = (event: Event) => {
      const error = (event as any).error || new Error("MediaRecorder failed");
      reject(error);
    };
  });

  const trimStart = Math.max(0, snapshot.trimStart);
  const trimEnd = Math.min(snapshot.trimEnd ?? duration, duration);
  const zoomEvents = ensureZoomEvents(snapshot.events);

  await seekVideo(video, trimStart);

  recorder.start();

  let stopped = false;

  const stopRecording = () => {
    if (stopped) return;
    stopped = true;
    try {
      video.pause();
    } catch (error) {
      console.warn("Failed to pause source video", error);
    }
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    renderStream.getTracks().forEach((track) => track.stop());
    audioSource?.getTracks().forEach((track) => track.stop());
  };

  const drawFrame = () => {
    if (stopped) return;

    const current = video.currentTime;
    if (current >= trimEnd || video.ended) {
      options.onProgress?.(trimEnd, trimEnd);
      stopRecording();
      return;
    }

    const { scale, focusX, focusY } = computeZoomState(zoomEvents, current);

    context.save();
    context.clearRect(0, 0, videoWidth, videoHeight);
    const pivotX = focusX * videoWidth;
    const pivotY = focusY * videoHeight;
    context.translate(pivotX, pivotY);
    context.scale(scale, scale);
    context.translate(-pivotX, -pivotY);
    context.drawImage(video, 0, 0, videoWidth, videoHeight);
    context.restore();

    options.onProgress?.(current, trimEnd);
    requestAnimationFrame(drawFrame);
  };

  const onTimeUpdate = () => {
    if (video.currentTime >= trimEnd) {
      stopRecording();
    }
  };

  video.addEventListener("timeupdate", onTimeUpdate);

  try {
    await video.play();
  } catch (error) {
    video.removeEventListener("timeupdate", onTimeUpdate);
    stopRecording();
    throw error instanceof Error ? error : new Error("Unable to play source video for rendering");
  }

  drawFrame();

  const blob = await resultPromise.finally(() => {
    video.removeEventListener("timeupdate", onTimeUpdate);
    renderStream.getTracks().forEach((track) => track.stop());
    audioSource?.getTracks().forEach((track) => track.stop());
  });

  return blob;
};
