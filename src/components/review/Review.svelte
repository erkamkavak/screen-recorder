<script lang="ts">
  import ReviewPlayerPane from "./ReviewPlayerPane.svelte";
  import ReviewRenderSidebar from "./ReviewRenderSidebar.svelte";
  import type { PointerEventRecord } from "../../lib/stores";
  import type {
    Background,
    CanvasSize,
    GeneralLayoutState,
    LastRecording,
    RecordingAssets,
    ScreenState,
    Theme,
    WebcamLayoutState,
  } from "../../lib/stores";
  import type { TimelineSnapshot } from "../../lib/stores/timeline";
  import { onDestroy, onMount } from "svelte";
  import { transcriptionSettings } from "../../lib/stores/transcription";
  import { transcriptionResult } from "../../lib/stores/reviewSession";
  import { computeReviewLayoutSizes } from "../../lib/review/layoutSizing";
  import type { RenderFormatOption, PointerIconOption } from "../../lib/review/reviewTypes";

  export let lastRecording: LastRecording = null;
  export let assets: RecordingAssets | null = null;
  export let canvasSize: CanvasSize;
  export let generalLayoutState: GeneralLayoutState;
  export let screenLayoutState: ScreenState;
  export let webcamLayoutState: WebcamLayoutState;
  export let theme: Theme;
  export let background: Background;
  export let currentSnapshot: TimelineSnapshot;

  export let resolutionPresets: readonly { id: string; label: string; scale: number }[] = [];
  export let frameRatePresets: readonly { id: string; label: string; fps: number | "original" }[] = [];
  export let renderFormatOptions: RenderFormatOption[] = [];
  export let pointerIconOptions: PointerIconOption[] = [];
  export let removablePointerIconIds: string[] = [];
  export let zipPointerImportMessage = "";
  export let onZipPointerFileChange: (event: Event, providerId: string) => void = () => {};
  export let onRemovePointerIconOption: (id: string) => void = () => {};

  export let pointerIconImageUrl: string | null = null;
  export let pointerIconPressedImageUrl: string | null = null;

  export let videoDuration = 0;
  export let videoCurrentTime = 0;
  export let screenWidth = 0;
  export let screenHeight = 0;
  export let isRenderingVideo = false;
  export let renderProgress = 0;
  export let playerFrameEl: HTMLDivElement | null = null;
  export let downloadEditedVideo: () => Promise<void>;
  export let onCancelRender: () => void = () => {};
  export let resetToRecorder: () => void;
  export let addZoomForClick: (event: PointerEventRecord, seconds?: number) => void;
  export let timelineDuration = 0;

  export let onSaveProject: () => void = () => {};
  export let isSavingProject: boolean = false;
  export let projectSaved: boolean = false;

  export let onContinueRecording: () => void = () => {};
  export let onResetAndNew: () => void = () => {};
  export let canContinueRecording: boolean = true;

  export let onSegmentTrimChange: ((segmentId: string, edge: "start" | "end", valueMs: number) => void) | null = null;

  const minPreviewWidth = 1080;
  const minAsideWidth = 320;
  const resizeGutter = 16;

  let reviewRootEl: HTMLDivElement | null = null;
  let previewWidthPx = 1080;
  let asideWidthPx = minAsideWidth;
  let isResizing = false;
  let rootResizeObserver: ResizeObserver | null = null;
  let isZoomEditorOpen = false;

  const computeLayoutSizes = (rootWidth: number, requestedPreview?: number) => {
    const { previewWidthPx: preview, asideWidthPx: aside } = computeReviewLayoutSizes(
      rootWidth,
      requestedPreview,
      { minPreviewWidth, minAsideWidth, resizeGutter }
    );
    previewWidthPx = preview;
    asideWidthPx = aside;
  };

  const updateRootWidth = () => {
    if (isResizing || !reviewRootEl) return;
    const rect = reviewRootEl.getBoundingClientRect();
    const styles = getComputedStyle(reviewRootEl);
    const paddingLeft = parseFloat(styles.paddingLeft || "0");
    const paddingRight = parseFloat(styles.paddingRight || "0");
    const innerWidth = rect.width - paddingLeft - paddingRight;
    if (isZoomEditorOpen) {
      previewWidthPx = innerWidth;
      asideWidthPx = 0;
      return;
    }
    computeLayoutSizes(innerWidth);
  };

  const handleResizeMove = (event: PointerEvent) => {
    if (!reviewRootEl) return;
    const rect = reviewRootEl.getBoundingClientRect();
    const styles = getComputedStyle(reviewRootEl);
    const paddingLeft = parseFloat(styles.paddingLeft || "0");
    const paddingRight = parseFloat(styles.paddingRight || "0");
    const innerWidth = rect.width - paddingLeft - paddingRight;
    const targetWidth = event.clientX - rect.left - paddingLeft;
    computeLayoutSizes(innerWidth, targetWidth);
  };

  const stopResize = () => {
    if (!isResizing) return;
    isResizing = false;
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", stopResize);
  };

  const startResize = (event: PointerEvent) => {
    event.preventDefault();
    isResizing = true;
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", stopResize);
  };

  $: hasWebcam = !!assets?.webcam;
  $: hasAudio = !!assets?.audio;

  const openZoomEditor = () => {
    isZoomEditorOpen = true;
    updateRootWidth();
  };

  const closeZoomEditor = () => {
    isZoomEditorOpen = false;
    updateRootWidth();
  };

  onMount(() => {
    updateRootWidth();
    const handleWindowResize = () => updateRootWidth();
    window.addEventListener("resize", handleWindowResize);
    rootResizeObserver = new ResizeObserver(updateRootWidth);
    if (reviewRootEl) {
      rootResizeObserver.observe(reviewRootEl);
    }
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      rootResizeObserver?.disconnect();
    };
  });

  const audioFilePath = assets?.audio?.filePath ?? null;

  onDestroy(() => {
    stopResize();
    rootResizeObserver?.disconnect();
  });
</script>

{#if lastRecording && assets}
  <div class="review-root" class:zoom-mode={isZoomEditorOpen} bind:this={reviewRootEl}>
    <ReviewPlayerPane
      {assets}
      {canvasSize}
      {generalLayoutState}
      {screenLayoutState}
      {webcamLayoutState}
      {theme}
      {background}
      snapshot={currentSnapshot}
      {pointerIconImageUrl}
      {pointerIconPressedImageUrl}
      bind:duration={videoDuration}
      bind:currentTime={videoCurrentTime}
      bind:screenWidth
      bind:screenHeight
      {timelineDuration}
      {addZoomForClick}
      bind:playerFrameEl
      {previewWidthPx}
      segments={lastRecording?.segments ?? []}
      {onSegmentTrimChange}
      {onSaveProject}
      {isSavingProject}
      {projectSaved}
      {onContinueRecording}
      {canContinueRecording}
      onOpenZoomEditor={openZoomEditor}
      onCloseZoomEditor={closeZoomEditor}
      {isZoomEditorOpen}
    />
    {#if !isZoomEditorOpen}
      <div
        class={`review-resize-handle ${isResizing ? "is-resizing" : ""}`}
        aria-hidden="true"
        on:pointerdown={startResize}
      />
      <ReviewRenderSidebar
        {asideWidthPx}
        {hasWebcam}
        {hasAudio}
        {audioFilePath}
        captionsAvailable={!!$transcriptionResult?.result?.segments?.length}
        {renderFormatOptions}
        {resolutionPresets}
        {frameRatePresets}
        {pointerIconOptions}
        {removablePointerIconIds}
        {zipPointerImportMessage}
        {onZipPointerFileChange}
        {onRemovePointerIconOption}
        {isRenderingVideo}
        {renderProgress}
        onRender={downloadEditedVideo}
        {onCancelRender}
        {resetToRecorder}
        {onResetAndNew}
        {onContinueRecording}
        {videoDuration}
      />
    {/if}
  </div>
{:else}
  <div class="fallback">
    <p>No recording available.</p>
    <button class="secondary" on:click={resetToRecorder}>Back to recorder</button>
  </div>
{/if}

<style>
  .review-root {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 2rem 2rem;
    background: #f6f7fb;
    min-height: 100vh;
    box-sizing: border-box;
    align-items: stretch;
    max-width: 100%;
    overflow-x: hidden;
  }

  .review-resize-handle {
    width: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ew-resize;
    position: relative;
    align-self: stretch;
    margin: 0 0.5rem;
  }

  .review-resize-handle::before {
    content: "";
    width: 2px;
    height: 70%;
    border-radius: 999px;
    background: linear-gradient(180deg, #cbd5e1, #f97316, #cbd5e1);
    opacity: 0.5;
    transition: opacity 0.2s ease;
  }

  .review-resize-handle.is-resizing::before {
    opacity: 1;
  }

  .review-resize-handle::after {
    content: "";
    position: absolute;
    left: -8px;
    right: -8px;
    top: 0;
    bottom: 0;
  }

  .fallback {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
  }

  @media (max-width: 1024px) {
    .review-root {
      flex-direction: column;
      gap: 2rem;
    }

    .review-resize-handle {
      display: none;
    }
  }

  :global(.toggle-group) { 
    display: flex; 
    flex-direction: column;
    gap: 0.5rem; 
  }
  :global(.toggle-group .cb) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9375rem;
    font-weight: 500;
    color: #475569;
    cursor: pointer;
    padding: 0.5rem 0.875rem;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
    transition: all 0.2s;
  }
  :global(.toggle-group .cb:hover) {
    background: #f1f5f9;
    color: #0f172a;
    border-color: #e2e8f0;
  }
  :global(.toggle-group .cb.disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  :global(.cb-input) {
    appearance: none;
    width: 20px;
    height: 20px;
    border: 2px solid #cbd5e1;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  :global(.cb-input:checked) {
    background: #3b82f6;
    border-color: #3b82f6;
  }
  :global(.cb-input:checked::after) {
    content: "";
    width: 6px;
    height: 10px;
    border: solid #fff;
    border-width: 0 2.5px 2.5px 0;
    transform: rotate(45deg) translateY(-1px);
  }
  :global(.cb-input:disabled) {
    border-color: #e2e8f0;
    background: #f8fafc;
  }

  :global(.format-field) { 
    margin-top: 1rem; 
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  :global(.field-label) {
    display: block;
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  :global(.select-wrapper) { position: relative; }
  :global(.select-wrapper select) {
    width: 100%;
    padding: 0.5rem 0.875rem;
    border-radius: 14px;
    border: 1.5px solid #e2e8f0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: #1e293b;
    background: #ffffff;
    appearance: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  :global(.select-wrapper select:hover) {
    border-color: #cbd5e1;
    background: #f8fafc;
  }
  :global(.select-wrapper select:focus) {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  }
  :global(.select-wrapper::after) {
    content: "";
    position: absolute;
    pointer-events: none;
    right: 1rem;
    top: 50%;
    width: 10px;
    height: 10px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    background-size: contain;
    background-repeat: no-repeat;
    transform: translateY(-50%);
    transition: all 0.2s;
  }

  :global(.aside-text) {
    margin: 0;
    color: #475569;
    line-height: 1.4;
  }
  :global(.button-stack) {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  :global(.primary),
  :global(.danger),
  :global(.secondary) {
    border-radius: 10px;
    font-weight: 600;
    padding: 0.7rem 1rem;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global(.primary) { background: #111827; color: #fff; }
  :global(.primary:disabled) { opacity: 0.6; cursor: not-allowed; }
  :global(.primary:hover:not(:disabled)) { background: #1f2937; }

  :global(.danger) { background: #ef4444; color: #fff; }
  :global(.danger:hover) { background: #dc2626; }

  :global(.secondary) {
    background: #ffffff;
    color: #334155;
    border: 1px solid #cbd5e1;
  }
  :global(.secondary:hover) {
    background: #f1f5f9;
    color: #1e293b;
    border-color: #94a3b8;
  }

  :global(.stats) {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }
  :global(.stats dt) {
    font-size: 0.7rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  :global(.stats dd) {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
</style>
