<script lang="ts">
  import {
    activeBackground,
    activeTheme,
    appView,
    canvasDimensions,
    currentProject,
    generalLayoutState,
    lastRecording,
    screenLayoutState,
    webcamLayoutState,
  } from "../lib/stores";
  import type { PointerEventRecord } from "../lib/stores";
  import Review from "./review/Review.svelte";
  import cursorPackCursor from "../assets/cursors/cutecore-pink-cursor.png?url";
  import cursorPackPointer from "../assets/cursors/cutecore-pink-pointer.png?url";
  import { timelineStore } from "../lib/stores/timeline";
  import { onDestroy, onMount } from "svelte";
  import { transcriptionSettings } from "../lib/stores/transcription";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../lib/timeline/zoomDefaults";
  import {
    applyPersistedReviewState,
    type PersistedReviewState,
  } from "../lib/review/reviewProjectState";
  import {
    getResolutionPresets,
    frameRatePresets,
  } from "../lib/rendering/renderPresets";
  import type { RenderFormat } from "../lib/stores/reviewSession";
  import { importPointerPackFromProvider } from "../lib/pointer/providers";
  import { addStoredPointerPacks, loadStoredPointerPacks, removeStoredPointerPack } from "../lib/pointer/pointerPackStorage";
  import type { StoredPointerPack } from "../lib/pointer/pointerPackTypes";
  import {
    saveProject as saveProjectAction,
    continueRecording as continueRecordingAction,
    downloadEditedVideo as downloadAction,
  } from "../lib/review/projectActions";
  import { reviewSessionStore } from "../lib/stores/reviewSession";
  import type { RenderFormatOption, PointerIconOption } from "../lib/review/reviewTypes";

  let videoDuration = 0;
  let videoCurrentTime = 0;
  let isRenderingVideo = false;
  let renderProgress = 0;
  let isSavingProject = false;
  let projectSaved = false;

  let playerFrameEl: HTMLDivElement | null = null;
  let frameObserver: ResizeObserver | null = null;

  let recordingDurationSeconds = 0;
  let timelineDuration = 0;
  let recordedScreenWidth = 0;
  let recordedScreenHeight = 0;
  let supportedRenderFormats: Record<string, boolean> = { mp4: true, webm: true };

  const baseRenderFormatOptions: { value: RenderFormat; label: string }[] = [
    { value: "mp4", label: "MP4 (H.264)" },
    { value: "webm", label: "WebM (VP9)" },
  ];

  let renderFormatOptions: RenderFormatOption[] = [];
  $: renderFormatOptions = baseRenderFormatOptions.map((option) => ({
    value: option.value,
    label: option.label,
    supported: supportedRenderFormats[option.value],
  }));

  $: resolutionPresets = getResolutionPresets($canvasDimensions);

  let pointerIconImageUrl: string | null = null;
  let pointerIconPressedImageUrl: string | null = null;

  let currentSnapshot = { segmentEvents: {} };
  // Reactive snapshot so zoom changes reflect in composited preview
  $: currentSnapshot = {
    segmentEvents: $timelineStore.segmentEvents,
  };

  let hasRestoredReviewState = false;
  let currentRecordingSessionId: string | null = null;
  
  $: {
    const newId = $lastRecording?.segments?.[0]?.id ?? $lastRecording?.fileName;
    if (newId && newId !== currentRecordingSessionId) {
      currentRecordingSessionId = newId;
      hasRestoredReviewState = false;
      if ($lastRecording && !$lastRecording.reviewState) {
        console.log("New session without state, resetting to defaults");
        reviewSessionStore.reset();
      }
    }
  }

  $: if ($lastRecording?.reviewState && !hasRestoredReviewState) {
    const state = $lastRecording.reviewState as PersistedReviewState;
    try {
      console.log("Restoring review state:", state);
      applyPersistedReviewState({
        state,
        clamp,
        timeline: {
          loadSnapshot: timelineStore.loadSnapshot,
        },
        setIncludePointerTrack: reviewSessionStore.setIncludePointerTrack,
        setIncludeWebcamTrack: reviewSessionStore.setIncludeWebcamTrack,
        setIncludeAudioTrack: reviewSessionStore.setIncludeAudioTrack,
        setIncludeClickTrack: reviewSessionStore.setIncludeClickTrack,
        setPointerIndicatorSize: reviewSessionStore.setPointerIndicatorSize,
        setPointerIconSelection: reviewSessionStore.setPointerIconSelection,
        setRenderFormat: (v) => reviewSessionStore.setRenderFormat(v as any),
        setSelectedResolutionPreset: (v) => reviewSessionStore.setSelectedResolutionPreset(v as any),
        setSelectedFrameRatePreset: (v) => reviewSessionStore.setSelectedFrameRatePreset(v as any),
        setShowCaptions: (v) => {
          reviewSessionStore.setShowCaptions(v);
          transcriptionSettings.set({ ...$transcriptionSettings, showCaptions: v });
        }
      });
      currentSnapshot = timelineStore.snapshot();
    } finally {
      hasRestoredReviewState = true;
    }
  }

  $: if (!$lastRecording) {
    hasRestoredReviewState = false;
    currentRecordingSessionId = null;
  }

  const updateVideoFrameMetrics = () => {
    // Logic moved to stores or child components if needed
  };

  const observeVideoFrame = () => {
    frameObserver?.disconnect();
    if (!playerFrameEl) return;
    frameObserver = new ResizeObserver(updateVideoFrameMetrics);
    frameObserver.observe(playerFrameEl);
    const videoFrameEl = playerFrameEl.querySelector<HTMLElement>(".video-frame");
    if (videoFrameEl) {
      frameObserver.observe(videoFrameEl);
    }
    updateVideoFrameMetrics();
  };

  onMount(() => {
    updateVideoFrameMetrics();
    window.addEventListener("resize", updateVideoFrameMetrics);
    return () => window.removeEventListener("resize", updateVideoFrameMetrics);
  });

  onMount(() => {
    const supportsType = (type: string) => {
      if (typeof MediaRecorder === "undefined") return false;
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    };
    supportedRenderFormats = {
      mp4: supportsType("video/mp4;codecs=h264") || supportsType("video/mp4"),
      webm: supportsType("video/webm;codecs=vp9") || supportsType("video/webm"),
    };
    if (!supportedRenderFormats[$reviewSessionStore.renderFormat]) {
      const fallback = supportedRenderFormats.mp4 ? "mp4" : "webm";
      reviewSessionStore.setRenderFormat(fallback as any);
    }
  });

  $: if (playerFrameEl) {
    observeVideoFrame();
  } else {
    frameObserver?.disconnect();
    frameObserver = null;
  }

  onDestroy(() => {
    frameObserver?.disconnect();
    timelineStore.reset();
  });

  $: recordingDurationSeconds = $lastRecording ? Math.max(0, $lastRecording.duration / 1000) : 0;

  $: segmentsOriginalDuration = ($lastRecording?.segments ?? []).reduce(
    (sum, seg) => sum + Math.max(0, seg.duration / 1000),
    0
  );

  $: timelineDuration =
    ($lastRecording?.segments?.length ?? 0) > 0
      ? segmentsOriginalDuration
      : videoDuration > 0
        ? videoDuration
        : recordingDurationSeconds;

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const clampToTimelineDuration = (value: number) => {
    const duration = Math.max(timelineDuration, 0);
    return Math.max(0, Math.min(value, duration));
  };

  const builtinPointerIconOptions: PointerIconOption[] = [
    {
      id: "cutecore-pink",
      label: "Cutecore Pink",
      data: `url("${cursorPackCursor}")`,
      pressedData: `url("${cursorPackPointer}")`,
    },
  ];

  let zipPointerIconOptions: StoredPointerPack[] = loadStoredPointerPacks();
  let pointerIconOptions: PointerIconOption[] = builtinPointerIconOptions;
  let pointerIconOptionMap = new Map<string, PointerIconOption>();
  let zipPointerImportMessage = "";
  let removablePointerIconIds: string[] = [];

  const handleZipPointerFile = async (event: Event, providerId: string) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    
    const { options, packs, message } = await importPointerPackFromProvider(providerId, file);
    
    if (packs.length > 0) {
      zipPointerIconOptions = [...zipPointerIconOptions, ...packs];
      addStoredPointerPacks(packs);
      reviewSessionStore.setPointerIconSelection(packs[0].id);
    }
    
    zipPointerImportMessage = message;
    input.value = "";
  };

  $: pointerIconOptions = [...builtinPointerIconOptions, ...zipPointerIconOptions];

  $: pointerIconOptionMap = new Map(pointerIconOptions.map((option) => [option.id, option]));
  $: removablePointerIconIds = zipPointerIconOptions.map((option) => option.id);

  const removePointerPack = (id: string) => {
    zipPointerIconOptions = zipPointerIconOptions.filter((option) => option.id !== id);
    removeStoredPointerPack(id);
    if ($reviewSessionStore.pointerIconSelection === id) {
      reviewSessionStore.setPointerIconSelection(builtinPointerIconOptions[0]?.id ?? "");
    }
  };

  $: {
    const option = pointerIconOptionMap.get($reviewSessionStore.pointerIconSelection);
    const pointerIconUrl = option?.data ?? null;
    const pointerIconPressedUrl = option?.pressedData ?? option?.data ?? null;

    const unwrapCssUrl = (value: string | null): string | null => {
      if (!value) return null;
      let v = value.trim();

      // Strip outer url(...) wrapper if present
      if (v.startsWith("url(") && v.endsWith(")")) {
        v = v.slice(4, -1).trim();
      }

      // Strip matching leading/trailing quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1).trim();
      }

      // Defensive: remove any stray trailing quote that slipped through
      if (v.endsWith('"') || v.endsWith("'")) {
        v = v.slice(0, -1).trim();
      }

      return v;
    };

    pointerIconImageUrl = unwrapCssUrl(pointerIconUrl);
    pointerIconPressedImageUrl = unwrapCssUrl(pointerIconPressedUrl);
  }

  const addZoomForClick = (clickEvent: PointerEventRecord, seconds?: number) => {
    const duration = Math.max(timelineDuration, 0);
    if (duration <= 0) return;

    const timestampSeconds = clampToTimelineDuration(seconds ?? clickEvent.t / 1000);
    const segs = $lastRecording?.segments ?? [];
    if (segs.length) {
      let acc = 0;
      for (const seg of segs) {
        const segDur = Math.max(0, seg.duration / 1000);
        const within = timestampSeconds >= acc && timestampSeconds <= acc + segDur;
        if (within) {
          const segmentId = seg.id;
          const localTime = Math.max(0, timestampSeconds - acc);
          // Avoid duplicate zooms in the same segment
          const existing = ($timelineStore.segmentEvents?.[segmentId] ?? []).find(
            (e) => e.type === "zoom" && localTime >= e.startTime && localTime <= e.startTime + e.duration
          );
          if (existing) {
            timelineStore.selectEvent({ segmentId, eventId: existing.id });
            return;
          }

          const focusX = typeof clickEvent.x === "number" ? clickEvent.x : 0.5;
          const focusY = typeof clickEvent.y === "number" ? clickEvent.y : 0.5;
          const localStartTime = clamp(localTime - ZOOM_DEFAULT_DURATION / 2, 0, Math.max(0, segDur));

          timelineStore.addZoom(segmentId, {
            startTime: localStartTime,
            duration: Math.min(ZOOM_DEFAULT_DURATION, Math.max(0.1, segDur - localStartTime)),
            focusX,
            focusY,
            zoom: ZOOM_DEFAULT_SCALE,
            label: "Click zoom",
          });
          return;
        }
        acc += segDur;
      }
    }

    // No segments: ignore (legacy path no longer supported for zoom authoring here)
  };

  const resetToRecorder = () => {
    $appView = "recorder";
  };

  const handleSegmentTrimChange = (segmentId: string, edge: "start" | "end", valueMs: number) => {
    if (!$lastRecording?.segments) return;
    
    const updatedSegments = $lastRecording.segments.map((seg) => {
      if (seg.id !== segmentId) return seg;
      
      const maxTrim = seg.duration - (edge === "start" ? seg.trimEnd : seg.trimStart) - 100; // Keep at least 100ms
      const clampedValue = Math.max(0, Math.min(valueMs, maxTrim));
      
      if (edge === "start") {
        return { ...seg, trimStart: clampedValue };
      } else {
        return { ...seg, trimEnd: clampedValue };
      }
    });

    // Recompute startOffsets
    let offset = 0;
    for (const seg of updatedSegments) {
      seg.startOffset = offset;
      offset += Math.max(0, seg.duration - seg.trimStart - seg.trimEnd);
    }

    lastRecording.update((rec) => rec ? { ...rec, segments: updatedSegments } : rec);
    
    // Mark project as unsaved when trims change
    projectSaved = false;
  };

  const saveProject = () => saveProjectAction((v) => (isSavingProject = v), () => (projectSaved = true));
  const resetAndNewProject = () => {
    lastRecording.set(null);
    currentProject.set(null);
    $appView = "recorder";
  };

  const continueRecording = () => continueRecordingAction();

  let currentCancelToken = { current: null as { cancelled: boolean } | null };
  const downloadEditedVideo = () =>
    downloadAction(
      (v) => (isRenderingVideo = v),
      (v) => (renderProgress = v),
      currentCancelToken,
      { pointerIconUrl: pointerIconImageUrl, pointerIconPressedUrl: pointerIconPressedImageUrl }
    );

  const cancelCurrentRender = () => {
    if (currentCancelToken.current) currentCancelToken.current.cancelled = true;
  };

</script>

  <Review
  bind:playerFrameEl
  lastRecording={$lastRecording}
  assets={$lastRecording?.assets ?? null}
  canvasSize={$canvasDimensions}
  generalLayoutState={$generalLayoutState}
  screenLayoutState={$screenLayoutState}
  webcamLayoutState={$webcamLayoutState}
  theme={$activeTheme}
  background={$activeBackground}
  timelineDuration={timelineDuration}
  currentSnapshot={currentSnapshot}
  {pointerIconOptions}
  {removablePointerIconIds}
  zipPointerImportMessage={zipPointerImportMessage}
  onZipPointerFileChange={handleZipPointerFile}
  onRemovePointerIconOption={removePointerPack}
  pointerIconImageUrl={pointerIconImageUrl}
  pointerIconPressedImageUrl={pointerIconPressedImageUrl}
  bind:videoDuration
  bind:videoCurrentTime
  bind:screenWidth={recordedScreenWidth}
  bind:screenHeight={recordedScreenHeight}
  {isRenderingVideo}
  {renderProgress}
  {downloadEditedVideo}
  onCancelRender={cancelCurrentRender}
  {resetToRecorder}
  onResetAndNew={resetAndNewProject}
  {addZoomForClick}
  renderFormatOptions={renderFormatOptions}
  resolutionPresets={resolutionPresets}
  frameRatePresets={frameRatePresets}
  onSaveProject={saveProject}
  {isSavingProject}
  {projectSaved}
  onContinueRecording={continueRecording}
  onSegmentTrimChange={handleSegmentTrimChange}
/>
