<script lang="ts">
  import {
  activeBackground,
  activeShare,
  activeTheme,
  appView,
  canvasDimensions,
  generalLayoutState,
    lastRecording,
    recordingFPS,
    screenLayoutState,
    webcamLayoutState,
    type RecordingAsset,
  } from "../stores";
  import type { PointerEventRecord } from "../stores";
  import Review from "./review/Review.svelte";
  import { timelineStore } from "../stores/timeline";
  import { onDestroy, onMount } from "svelte";
  import {
    renderCompositeRecording,
    type RenderCompositeOptions,
    type RenderResult,
  } from "../utils/renderEditedRecording";
  import { getAssetUrlFromFile, disposeAssetUrl } from "../utils/assetStorage";
  import {
    computePointerState,
    getPointerRecords,
  } from "./review/helpers";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../utils/zoomDefaults";
  import { calculateScreenPlacement } from "../utils/layoutDrawers";
  import type { ScreenPlacement } from "../utils/layoutDrawers";
  import { findZoomEventForTime } from "../utils/zoomEvents";

  let videoDuration = 0;
  let videoCurrentTime = 0;
  let isRenderingVideo = false;
  let renderProgress = 0;

  let includePointerTrack = true;
  let includeWebcamTrack = true;
  let includeAudioTrack = true;

  let playerFrameEl: HTMLDivElement | null = null;
  let frameWidth = 0;
  let frameHeight = 0;
  let pointerState = { x: 0.5, y: 0.5, visible: false };
  let pointerIndicatorSize = 18;
  let pointerIndicatorColor = "#f97316";
  let pointerIconSelection: typeof pointerIconOptions[number]['id'] = "none";
  let pointerIconUrl: string | null = null;
  let pointerShadow = "rgba(249, 115, 22, 0.4)";
  let screenPlacement: ScreenPlacement | null = null;
  let pointerStyle = "opacity: 0;";
  let videoSource = "";
  let activeAssetPath: string | null = null;
  let loadToken = 0;
  let recordingDurationSeconds = 0;
  let timelineDuration = 0;
  
  let currentSnapshot = timelineStore.snapshot();
  // Reactive snapshot so zoom/trim changes reflect in composited preview
  $: ($timelineStore, currentSnapshot = timelineStore.snapshot());

  const updateFrameSize = () => {
    if (!playerFrameEl) return;
    frameWidth = playerFrameEl.clientWidth;
    frameHeight = playerFrameEl.clientHeight;
  };

  onMount(() => {
    updateFrameSize();
    window.addEventListener("resize", updateFrameSize);
    return () => window.removeEventListener("resize", updateFrameSize);
  });

  $: if (playerFrameEl) {
    updateFrameSize();
  }

  onDestroy(() => {
    timelineStore.reset();
    if (activeAssetPath) {
      disposeAssetUrl(activeAssetPath);
    }
  });

  let pointerRecords: PointerEventRecord[] = [];
  $: pointerRecords = getPointerRecords($lastRecording?.events);
  $: pointerState = computePointerState(videoCurrentTime, pointerRecords);

  $: recordingDurationSeconds = $lastRecording ? Math.max(0, $lastRecording.duration / 1000) : 0;
  $: timelineDuration = Math.max(recordingDurationSeconds, videoDuration);

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const clampToTimelineDuration = (value: number) => {
    const duration = Math.max(timelineDuration, 0);
    return Math.max(0, Math.min(value, duration));
  };

  const hexToRgba = (hex: string, alpha = 1) => {
    let normalized = hex?.trim()?.replace(/^#/, "") ?? "";
    if (normalized.length === 3) {
      normalized = normalized
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (normalized.length !== 6) {
      return `rgba(249, 115, 22, ${alpha})`;
    }
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some((component) => Number.isNaN(component))) {
      return `rgba(249, 115, 22, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const svgToDataUrl = (svg: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  const pointerIconOptions = [
    { id: "none", label: "Default", data: null },
    {
      id: "arrow",
      label: "Arrow",
      data: svgToDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M5 4l14 7-6 2 6 2-14 7z"/></svg>`
      ),
    },
    {
      id: "crosshair",
      label: "Crosshair",
      data: svgToDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>`
      ),
    },
    {
      id: "dots",
      label: "Dots",
      data: svgToDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="4" cy="4" r="2" fill="currentColor"/><circle cx="12" cy="4" r="2" fill="currentColor"/><circle cx="8" cy="12" r="2" fill="currentColor"/></svg>`
      ),
    },
  ] as const;

  const pointerIconMap = new Map(pointerIconOptions.map((option) => [option.id, option.data]));

  const getPointerIconUrl = (selection: typeof pointerIconOptions[number]['id']) =>
    pointerIconMap.get(selection) ?? null;

  $: pointerIconUrl  = getPointerIconUrl(pointerIconSelection);

  const updatePointerIconSelection = (selection: typeof pointerIconOptions[number]['id']) => {
    if (!pointerIconMap.has(selection)) return;
    pointerIconSelection = selection;
  };

  $: screenPlacement = calculateScreenPlacement(
    $canvasDimensions,
    $activeShare,
    $screenLayoutState,
    $generalLayoutState
  );

  $: {
    const canvasWidth = $canvasDimensions.width || 1;
    const canvasHeight = $canvasDimensions.height || 1;
    const scaleX = canvasWidth ? frameWidth / canvasWidth : 0;
    const scaleY = canvasHeight ? frameHeight / canvasHeight : 0;
    const placementX = screenPlacement
      ? screenPlacement.x + pointerState.x * screenPlacement.width
      : pointerState.x * canvasWidth;
    const placementY = screenPlacement
      ? screenPlacement.y + pointerState.y * screenPlacement.height
      : pointerState.y * canvasHeight;

    pointerShadow = hexToRgba(pointerIndicatorColor, 0.45);

    const pointerLeft = placementX * scaleX;
    const pointerTop = placementY * scaleY;

    pointerStyle =
      includePointerTrack &&
      pointerState.visible &&
      frameWidth > 0 &&
      frameHeight > 0 &&
      scaleX > 0 &&
      scaleY > 0
        ? `left: ${pointerLeft}px; top: ${pointerTop}px; opacity: 1; --pointer-size: ${clamp(
            pointerIndicatorSize,
            6,
            64
          )}px; --pointer-color: ${pointerIndicatorColor}; --pointer-shadow: ${pointerShadow}; --pointer-icon: ${
            pointerIconUrl ?? "none"
          };`
        : "opacity: 0;";
  }

  const updatePointerSize = (value: number) => {
    pointerIndicatorSize = clamp(value, 6, 64);
  };

  const updatePointerColor = (value: string) => {
    pointerIndicatorColor = value || "#f97316";
  };

  const loadVideoAsset = async (asset: RecordingAsset | null) => {
    const filePath = asset?.filePath ?? null;
    if (activeAssetPath === filePath) return;
    if (activeAssetPath) {
      disposeAssetUrl(activeAssetPath);
    }
    activeAssetPath = filePath;
    videoSource = "";
    if (!filePath) {
      return;
    }
    const token = ++loadToken;
    const url = await getAssetUrlFromFile(filePath, asset?.mimeType);
    if (token !== loadToken || activeAssetPath !== filePath) {
      disposeAssetUrl(filePath);
      return;
    }
    videoSource = url;
  };

  const findAssetByPath = (path: string | undefined | null): RecordingAsset | null => {
    if (!$lastRecording || !path) return null;
    return (
      Object.values($lastRecording.assets).find(
        (asset) => asset?.filePath === path
      ) ?? null
    );
  };

  $: if ($lastRecording) {
    const previewAsset =
      findAssetByPath($lastRecording.previewPath) ??
      $lastRecording.assets.screen ??
      $lastRecording.assets.webcam ??
      null;
    void loadVideoAsset(previewAsset);
  } else {
    void loadVideoAsset(null);
  }

  $: clickEvents = $lastRecording
    ? ($lastRecording.events.filter((event) => event.kind === "click" || event.kind === "pointerdown") as PointerEventRecord[])
    : [];
  $: sortedClickEvents = [...clickEvents].sort((a, b) => a.t - b.t);

  const addZoomForClick = (clickEvent: PointerEventRecord) => {
    const duration = Math.max(timelineDuration, 0);
    if (duration <= 0) return;

    const timestampSeconds = clampToTimelineDuration(clickEvent.t / 1000);
    const existingZoom = findZoomEventForTime($timelineStore.events, timestampSeconds);
    if (existingZoom) {
      timelineStore.selectEvent(existingZoom.id);
      return;
    }

    const focusX = typeof clickEvent.x === "number" ? clickEvent.x : 0.5;
    const focusY = typeof clickEvent.y === "number" ? clickEvent.y : 0.5;
    const startTime = clampToTimelineDuration(timestampSeconds - ZOOM_DEFAULT_DURATION / 2);

    timelineStore.addZoom({
      startTime,
      duration: ZOOM_DEFAULT_DURATION,
      focusX,
      focusY,
      zoom: ZOOM_DEFAULT_SCALE,
      label: "Click zoom",
    });
  };

  const resetToRecorder = () => {
    $appView = "recorder";
  };

  const buildRenderOptions = (onProgress?: (current: number, end: number) => void): RenderCompositeOptions => ({
    canvasSize: $canvasDimensions,
    generalLayoutState: $generalLayoutState,
    screenLayoutState: $screenLayoutState,
    webcamLayoutState: $webcamLayoutState,
    theme: $activeTheme,
    background: $activeBackground,
    frameRate: $recordingFPS,
    toggles: {
      showScreen: true,
      showWebcam: includeWebcamTrack,
      showMouse: includePointerTrack,
      includeAudio: includeAudioTrack,
    },
    onProgress,
  });

  const downloadEditedVideo = async () => {
    if (!$lastRecording) return;
    isRenderingVideo = true;
    renderProgress = 0;

    let cleanupPath: string | null = null;
    try {
      const result: RenderResult = await renderCompositeRecording(
        $lastRecording.assets,
        $lastRecording.duration,
        timelineStore.snapshot(),
        buildRenderOptions((current, end) => {
          renderProgress = end ? Math.min(100, Math.round((current / end) * 100)) : 0;
        })
      );

      if (result.type === "file") {
        cleanupPath = result.filePath;
        const savedPath = await window.electronAPI?.saveRenderedFile?.({
          filePath: result.filePath,
          fileName: `edited-${$lastRecording.fileName}`,
        });
        if (!savedPath) {
          console.warn("Rendered file save cancelled");
          return;
        }
        return;
      }

      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `edited-${$lastRecording.fileName}`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        anchor.remove();
      }, 1000);
    } catch (error) {
      console.error("Failed to render edited video", error);
    } finally {
      isRenderingVideo = false;
      renderProgress = 0;
      if (cleanupPath) {
        window.electronAPI?.cleanupRecordingAssets?.([cleanupPath]);
      }
    }
  };

</script>

<Review
  bind:playerFrameEl={playerFrameEl}
  lastRecording={$lastRecording}
  assets={$lastRecording?.assets ?? null}
  canvasSize={$canvasDimensions}
  generalLayoutState={$generalLayoutState}
  screenLayoutState={$screenLayoutState}
  webcamLayoutState={$webcamLayoutState}
  theme={$activeTheme}
  background={$activeBackground}
  timelineDuration={timelineDuration}
  recordingFPS={$recordingFPS}
  currentSnapshot={currentSnapshot}
  bind:includePointerTrack={includePointerTrack}
  bind:includeWebcamTrack={includeWebcamTrack}
  bind:includeAudioTrack={includeAudioTrack}
  {pointerStyle}
  pointerSize={pointerIndicatorSize}
  pointerColor={pointerIndicatorColor}
  pointerIconUrl={pointerIconUrl}
  pointerIconSelection={pointerIconSelection}
  pointerIconOptions={pointerIconOptions}
  onPointerSizeChange={updatePointerSize}
  onPointerColorChange={updatePointerColor}
  onPointerIconSelect={updatePointerIconSelection}
  {clickEvents}
  {sortedClickEvents}
  {videoDuration}
  {videoCurrentTime}
  {isRenderingVideo}
  {renderProgress}
  {downloadEditedVideo}
  {resetToRecorder}
  {addZoomForClick}
/>
