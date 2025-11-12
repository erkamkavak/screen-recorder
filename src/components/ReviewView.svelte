<script lang="ts">
  import {
    activeBackground,
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
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../utils/zoomDefaults";
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
  let pointerStyle = "opacity: 0;";
  let videoSource = "";
  let activeAssetPath: string | null = null;
  let loadToken = 0;
  
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

  $: pointerStyle = includePointerTrack && pointerState.visible && frameWidth && frameHeight
    ? `left: ${pointerState.x * frameWidth}px; top: ${pointerState.y * frameHeight}px; opacity: 1;`
    : "opacity: 0;";

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
    const focusX = typeof clickEvent.x === "number" ? clickEvent.x : 0.5;
    const focusY = typeof clickEvent.y === "number" ? clickEvent.y : 0.5;
    const timestampSeconds = Math.max(0, clickEvent.t / 1000);
    const startTime = Math.max(0, Math.min(videoDuration, timestampSeconds - ZOOM_DEFAULT_DURATION / 2));

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
  recordingFPS={$recordingFPS}
  currentSnapshot={currentSnapshot}
  bind:includePointerTrack={includePointerTrack}
  bind:includeWebcamTrack={includeWebcamTrack}
  bind:includeAudioTrack={includeAudioTrack}
  {pointerStyle}
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