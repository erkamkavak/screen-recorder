import { get } from "svelte/store";
import type { RecordingSegment } from "../stores";
import { timelineStore } from "../stores/timeline";
import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../timeline/zoomDefaults";

type ZoomDraft = { segmentId: string; eventId: string; startTime: number };

interface ZoomEditorControllerOptions {
  getCurrentTime: () => number;
  getTimelineDuration: () => number;
  getSegments: () => RecordingSegment[];
  getPlayer: () => any;
  getPlayerFrameEl: () => HTMLDivElement | null;
  onClose: () => void;
  onRecordingChange?: (active: boolean) => void;
}

const clampTime = (value: number, duration: number) =>
  Math.max(0, Math.min(duration || 0, value));

const findSegmentForTime = (segments: RecordingSegment[], timeSec: number) => {
  let acc = 0;
  for (const seg of segments) {
    const trimStartSec = Math.max(0, seg.trimStart / 1000);
    const trimEndSec = Math.max(0, seg.trimEnd / 1000);
    const effectiveDur = Math.max(0, (seg.duration - seg.trimStart - seg.trimEnd) / 1000);
    const segDur = Math.max(0, seg.duration / 1000);
    if (timeSec <= acc + effectiveDur + 0.0001) {
      const segmentEndSec = Math.max(trimStartSec, segDur - trimEndSec);
      const localTime = Math.max(
        trimStartSec,
        Math.min(segmentEndSec, (timeSec - acc) + trimStartSec)
      );
      return {
        segmentId: seg.id,
        localTime,
        segDur: effectiveDur,
      };
    }
    acc += effectiveDur;
  }
  return null;
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

export const createZoomEditorController = (options: ZoomEditorControllerOptions) => {
  let zoomDraft: ZoomDraft | null = null;
  let lastPointer = { x: 0.5, y: 0.5 };
  let keyListenerActive = false;

  const setRecording = (active: boolean) => {
    options.onRecordingChange?.(active);
  };

  const startZoomDraft = () => {
    const info = findSegmentForTime(options.getSegments(), options.getCurrentTime());
    if (!info) return;
    const localStartTime = Math.max(0, Math.min(info.segDur, info.localTime));
    timelineStore.addZoom(info.segmentId, {
      startTime: localStartTime,
      duration: Math.min(ZOOM_DEFAULT_DURATION, Math.max(0.1, info.segDur - localStartTime)),
      focusX: lastPointer.x,
      focusY: lastPointer.y,
      zoom: ZOOM_DEFAULT_SCALE,
      label: "Keyboard zoom",
    });
    const selected = get(timelineStore).selectedEvent;
    if (selected) {
      zoomDraft = { segmentId: selected.segmentId, eventId: selected.eventId, startTime: localStartTime };
      setRecording(true);
    }
  };

  const stopZoomDraft = () => {
    if (!zoomDraft) return;
    const info = findSegmentForTime(options.getSegments(), options.getCurrentTime());
    if (info && info.segmentId === zoomDraft.segmentId) {
      const duration = Math.max(0.1, info.localTime - zoomDraft.startTime + ZOOM_DEFAULT_DURATION / 2);
      timelineStore.updateZoom(zoomDraft.segmentId, zoomDraft.eventId, { duration });
    }
    zoomDraft = null;
    setRecording(false);
  };

  const toggleZoomDraft = () => {
    if (zoomDraft) {
      stopZoomDraft();
    } else {
      startZoomDraft();
    }
  };

  const seekBy = (delta: number) => {
    const duration = options.getTimelineDuration();
    const next = clampTime(options.getCurrentTime() + delta, duration);
    options.getPlayer()?.seekTo?.(next);
  };

  const togglePlay = () => {
    options.getPlayer()?.togglePlay?.();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        seekBy(event.shiftKey ? -1 : -5);
        break;
      case "ArrowRight":
        event.preventDefault();
        seekBy(event.shiftKey ? 1 : 5);
        break;
      case " ":
        event.preventDefault();
        togglePlay();
        break;
      case "z":
      case "Z":
        event.preventDefault();
        toggleZoomDraft();
        break;
      case "Escape":
        event.preventDefault();
        stopZoomDraft();
        options.onClose();
        break;
      default:
        break;
    }
  };

  const updatePointerFocus = (event: MouseEvent) => {
    const frameEl = options.getPlayerFrameEl();
    if (!frameEl) return;
    const rect = frameEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    lastPointer = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  };

  const enterFullscreen = async () => {
    const frameEl = options.getPlayerFrameEl();
    if (!frameEl || document.fullscreenElement) return;
    try {
      await frameEl.requestFullscreen();
    } catch {}
  };

  const exitFullscreen = async () => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {}
  };

  const handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      stopZoomDraft();
      options.onClose();
    }
  };

  const open = () => {
    if (keyListenerActive) return;
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    keyListenerActive = true;
    void enterFullscreen();
    const player = options.getPlayer();
    player?.seekTo?.(options.getCurrentTime());
    if (!player?.isPlaying?.()) {
      player?.playMedia?.();
    }
  };

  const close = () => {
    if (!keyListenerActive) return;
    window.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    keyListenerActive = false;
    stopZoomDraft();
    void exitFullscreen();
  };

  const syncZoomDuration = (currentTimeSec: number) => {
    if (!zoomDraft) return;
    const info = findSegmentForTime(options.getSegments(), currentTimeSec);
    if (info && info.segmentId === zoomDraft.segmentId) {
      const duration = Math.max(0.1, info.localTime - zoomDraft.startTime + ZOOM_DEFAULT_DURATION / 2);
      timelineStore.updateZoom(zoomDraft.segmentId, zoomDraft.eventId, { duration });
    }
  };

  return {
    open,
    close,
    updatePointerFocus,
    syncZoomDuration,
  };
};
