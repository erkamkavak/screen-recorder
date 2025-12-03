<script lang="ts">
  import CompositePlayer from "./CompositePlayer.svelte";
  import PointerStyleControls from "./PointerStyleControls.svelte";
  import Timeline from "../Timeline.svelte";
  import type { PointerEventRecord } from "../../stores";
  import type {
    Background,
    CanvasSize,
    GeneralLayoutState,
    LastRecording,
    RecordingAssets,
    ScreenState,
    Theme,
    WebcamLayoutState,
  } from "../../stores";
  import type { TimelineSnapshot } from "../../stores/timeline";
  import { humanDuration } from "./helpers";
  import { onDestroy, onMount } from "svelte";

  export let lastRecording: LastRecording = null;
  export let assets: RecordingAssets | null = null;
  export let canvasSize: CanvasSize;
  export let generalLayoutState: GeneralLayoutState;
  export let screenLayoutState: ScreenState;
  export let webcamLayoutState: WebcamLayoutState;
  export let theme: Theme;
  export let background: Background;
  export let recordingFPS: number = 30;
  export let currentSnapshot: TimelineSnapshot;

  export let includePointerTrack = true;
  export let includeWebcamTrack = true;
  export let includeAudioTrack = true;
  export let pointerStyle = "opacity: 0;";
  export let pointerSize = 14;
  export let pointerIconSelection = "none";
  export let pointerIconOptions: readonly {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
  }[] = [];
  export let onPointerSizeChange: (value: number) => void = () => {};
  export let onPointerIconSelect: (selection: string) => void = () => {};
  export let zipPointerImportMessage = "";
  export let onZipPointerFileChange: (event: Event) => void = () => {};
  export let clickEvents: PointerEventRecord[] = [];
  export let sortedClickEvents: PointerEventRecord[] = [];
  export let pointerRecords: PointerEventRecord[] = [];
  export let pointerIconImageUrl: string | null = null;
  export let pointerIconPressedImageUrl: string | null = null;
  export let pointerIndicatorSize: number = 14;
  export let videoDuration = 0;
  export let videoCurrentTime = 0;
  export let screenWidth = 0;
  export let screenHeight = 0;
  export let isRenderingVideo = false;
  export let renderProgress = 0;
  export let playerFrameEl: HTMLDivElement | null = null;
  export let downloadEditedVideo: () => Promise<void>;
  export let resetToRecorder: () => void;
  export let addZoomForClick: (event: PointerEventRecord) => void;
  export let timelineDuration = 0;

  const minPreviewWidth = 1080;
  const minAsideWidth = 320;
  const resizeGutter = 16;

  let reviewRootEl: HTMLDivElement | null = null;
  let previewWidthPx = 1080;
  let asideWidthPx = minAsideWidth;
  let isResizing = false;
  let rootResizeObserver: ResizeObserver | null = null;

  const clampBetween = (value: number, minValue: number, maxValue: number) =>
    Math.max(minValue, Math.min(value, maxValue));

  const computeLayoutSizes = (rootWidth: number, requestedPreview?: number) => {
    const safeRootWidth = Math.max(rootWidth, 0);
    const minTotal = minPreviewWidth + minAsideWidth + resizeGutter;

    if (safeRootWidth <= minTotal) {
      const available = Math.max(safeRootWidth - resizeGutter, 0);
      const previewRatio = minPreviewWidth / (minPreviewWidth + minAsideWidth);
      const preview = available * previewRatio;
      const aside = available - preview;
      previewWidthPx = Math.max(preview, 0);
      asideWidthPx = Math.max(aside, 0);
      return;
    }

    const suggestedPreview = requestedPreview ?? Math.max(minPreviewWidth, safeRootWidth * 0.7);
    const maxPreview = Math.max(safeRootWidth - minAsideWidth - resizeGutter, minPreviewWidth);
    const preview = clampBetween(suggestedPreview, minPreviewWidth, maxPreview);
    const maxAsideWidth = Math.max(safeRootWidth - minPreviewWidth - resizeGutter, minAsideWidth);
    const aside = clampBetween(safeRootWidth - preview - resizeGutter, minAsideWidth, maxAsideWidth);
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

  $: if (!hasWebcam) includeWebcamTrack = false;
  $: if (!hasAudio) includeAudioTrack = false;

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

  onDestroy(() => {
    stopResize();
    rootResizeObserver?.disconnect();
  });
</script>

{#if lastRecording && assets}
  <div class="review-root" bind:this={reviewRootEl}>
    <section
      class="review-main"
      style={`flex: 0 0 ${previewWidthPx}px; width: ${previewWidthPx}px;`}
    >
      <article class="playback-card plain">
        <header class="panel-header">
          <div>
            <h2>Review</h2>
            <p>Use the timeline to scrub. The screen asset plays back directly with a live pointer overlay.</p>
          </div>
        </header>

        <div class="player-frame narrow" bind:this={playerFrameEl}>
          <CompositePlayer
            assets={assets}
            canvasSize={canvasSize}
            generalLayoutState={generalLayoutState}
            screenLayoutState={screenLayoutState}
            webcamLayoutState={webcamLayoutState}
            theme={theme}
            background={background}
            snapshot={currentSnapshot}
            showScreen={true}
            showWebcam={includeWebcamTrack}
            showMouse={includePointerTrack}
            includeAudio={includeAudioTrack}
            frameRate={recordingFPS}
            pointerRecords={pointerRecords}
            pointerIconUrl={pointerIconImageUrl}
            pointerIconPressedUrl={pointerIconPressedImageUrl}
            pointerIndicatorSize={pointerIndicatorSize}
            bind:duration={videoDuration}
            bind:currentTime={videoCurrentTime}
            bind:screenWidth={screenWidth}
            bind:screenHeight={screenHeight}
          />
          <!-- <div class="pointer-indicator" style={pointerStyle} /> -->
        </div>

        <Timeline
          duration={timelineDuration}
          currentTime={videoCurrentTime}
          clickEvents={sortedClickEvents}
          onAddZoomForClick={addZoomForClick}
        />
      </article>
    </section>
    <div
      class={`review-resize-handle ${isResizing ? "is-resizing" : ""}`}
      aria-hidden="true"
      on:pointerdown={startResize}
    />
    <aside class="review-aside" style={`width: ${asideWidthPx}px;`}>
      <h1>Render options</h1>
      <p class="aside-text">Control the render, then download it as a video file.</p>

      <div class="toggle-group">
        <label class="cb"><input type="checkbox" class="cb-input" bind:checked={includePointerTrack} /> <span>Include pointer</span></label>
        <label class="cb" class:disabled={!hasWebcam}>
          <input type="checkbox" class="cb-input" bind:checked={includeWebcamTrack} disabled={!hasWebcam} />
          <span>Include webcam</span>
        </label>
        <label class="cb" class:disabled={!hasAudio}>
          <input type="checkbox" class="cb-input" bind:checked={includeAudioTrack} disabled={!hasAudio} />
          <span>Include audio</span>
        </label>
      </div>

      <PointerStyleControls
        pointerSize={pointerSize}
        pointerIconSelection={pointerIconSelection}
        pointerIconOptions={pointerIconOptions}
        zipPointerImportMessage={zipPointerImportMessage}
        onPointerSizeChange={onPointerSizeChange}
        onPointerIconSelect={onPointerIconSelect}
        onZipPointerFileChange={onZipPointerFileChange}
      />

      <div class="button-stack">
        <button class="primary" on:click={downloadEditedVideo} disabled={isRenderingVideo}>
          {#if isRenderingVideo}
            Rendering… {renderProgress}%
          {:else}
            Render and download
          {/if}
        </button>
        <button class="secondary" on:click={resetToRecorder}>Back to recorder</button>
      </div>

      <dl class="stats">
        <div>
          <dt>Duration</dt>
          <dd>{humanDuration(Math.round(videoDuration))}</dd>
        </div>
      </dl>
    </aside>
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

  .review-main {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 100%;
    min-width: 0;
    padding-right: 0.5rem;
  }

  .playback-card {
    background: transparent;
    padding: 0;
    box-shadow: none;
    border: none;
  }
  .playback-card.plain header { padding: 0 0 0.5rem 0; }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .panel-header p {
    margin: 0;
    font-size: 0.9rem;
    color: #475569;
  }

  .player-frame {
    margin-top: 0.5rem;
    position: relative;
    border-radius: 12px;
    border: none;
    background: transparent;
    overflow: visible;
    min-height: 0;
  }
  .player-frame.narrow {
    width: 100%;
    max-width: 100%;
    margin: 0;
  }

  .pointer-indicator {
    position: absolute;
    width: var(--pointer-size, 14px);
    height: var(--pointer-size, 14px);
    border-radius: var(--pointer-border-radius, 0px);
    background-color: transparent;
    background-image: var(--pointer-icon, none);
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    pointer-events: none;
    transition: opacity 0.2s ease;
    transform: translate(0%, -100%);
  }

  .review-aside {
    flex: 0 0 auto;
    min-width: 20rem;
    border-radius: 18px;
    border: 1px solid #e5e7eb;
    padding: 1.5rem;
    background: #fff;
    box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: sticky;
    top: 1.5rem;
    align-self: flex-start;
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

  .toggle-group { display: grid; gap: 0.5rem; }
  .toggle-group .cb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    color: #334155;
    cursor: pointer;
  }
  .toggle-group .cb.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cb-input {
    appearance: none;
    width: 18px;
    height: 18px;
    border: 2px solid #94a3b8;
    border-radius: 6px;
    display: inline-block;
    position: relative;
    background: #fff;
  }
  .cb-input:checked {
    background: #111827;
    border-color: #111827;
  }
  .cb-input:checked::after {
    content: "";
    position: absolute;
    left: 4px;
    top: 0px;
    width: 6px;
    height: 12px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .cb-input:disabled {
    border-color: #cbd5e1;
    background: #f1f5f9;
  }

  .review-aside h1 {
    margin: 0;
    font-size: 1.35rem;
  }

  .aside-text {
    margin: 0;
    color: #475569;
    line-height: 1.4;
  }

  .button-stack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .primary,
  .danger,
  .secondary {
    border-radius: 10px;
    font-weight: 600;
    padding: 0.7rem 1rem;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .primary { background: #111827; color: #fff; }
  .primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .primary:hover:not(:disabled) { background: #1f2937; }
  
  .danger { background: #ef4444; color: #fff; }
  .danger:hover { background: #dc2626; }

  .secondary {
    background: #ffffff;
    color: #334155;
    border: 1px solid #cbd5e1;
  }
  .secondary:hover {
    background: #f1f5f9;
    color: #1e293b;
    border-color: #94a3b8;
  }

  .stats {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }

  .stats dt {
    font-size: 0.7rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .stats dd {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
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

    .review-main {
      flex: 1 1 auto !important;
      width: auto !important;
      padding-right: 0;
    }

    .review-aside {
      position: static;
      width: auto !important;
      flex: 1 1 auto;
      margin-right: 0;
    }

    .review-resize-handle {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .playback-card { padding: 1rem; }
  }
</style>
