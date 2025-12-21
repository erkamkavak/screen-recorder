<script lang="ts">
  import CompositePlayer from "./CompositePlayer.svelte";
  import ReviewHeaderActions from "./ReviewHeaderActions.svelte";
  import ZoomEditorOverlay from "./ZoomEditorOverlay.svelte";
  import Timeline from "../Timeline.svelte";
  import type { PointerEventRecord, RecordingSegment } from "../../lib/stores";
  import {
    Background,
    CanvasSize,
    GeneralLayoutState,
    RecordingAssets,
    ScreenState,
    Theme,
    WebcamLayoutState,
    currentProject,
  } from "../../lib/stores";
  import type { TimelineSnapshot } from "../../lib/stores/timeline";
  import { onDestroy } from "svelte";
  import { createZoomEditorController } from "../../lib/review/zoomEditorController";

  export let assets: RecordingAssets;
  export let canvasSize: CanvasSize;
  export let generalLayoutState: GeneralLayoutState;
  export let screenLayoutState: ScreenState;
  export let webcamLayoutState: WebcamLayoutState;
  export let theme: Theme;
  export let background: Background;
  export let snapshot: TimelineSnapshot;

  export let transcript: { segments: { startMs: number; endMs: number; text: string }[] } | null = null;

  export let pointerIconImageUrl: string | null = null;
  export let pointerIconPressedImageUrl: string | null = null;

  export let duration = 0;
  export let currentTime = 0;
  export let screenWidth = 0;
  export let screenHeight = 0;

  export let timelineDuration = 0;
  export let addZoomForClick: (event: PointerEventRecord, seconds?: number) => void;
  export let segments: RecordingSegment[] = [];
  export let onSegmentTrimChange: ((segmentId: string, edge: "start" | "end", valueMs: number) => void) | null = null;

  export let playerFrameEl: HTMLDivElement | null = null;

  export let previewWidthPx: number;

  export let onSaveProject: () => void;
  export let isSavingProject: boolean = false;
  export let projectSaved: boolean = false;

  export let onContinueRecording: () => void;
  export let canContinueRecording: boolean = true;

  export let onOpenZoomEditor: () => void = () => {};
  export let onCloseZoomEditor: () => void = () => {};
  export let isZoomEditorOpen: boolean = false;

  let player: any;
  let isZoomRecording = false;

  const zoomEditorController = createZoomEditorController({
    getCurrentTime: () => currentTime,
    getTimelineDuration: () => timelineDuration,
    getSegments: () => segments,
    getPlayer: () => player,
    getPlayerFrameEl: () => playerFrameEl,
    onClose: onCloseZoomEditor,
    onRecordingChange: (active) => {
      isZoomRecording = active;
    },
  });

  $: if (isZoomEditorOpen) {
    zoomEditorController.open();
  } else {
    zoomEditorController.close();
  }

  $: if (isZoomEditorOpen && isZoomRecording) {
    zoomEditorController.syncZoomDuration(currentTime);
  }

  onDestroy(() => {
    zoomEditorController.close();
  });
</script>

<section
  class="review-main"
  class:zoom-mode={isZoomEditorOpen}
  style={`flex: 0 0 ${previewWidthPx}px; width: ${previewWidthPx}px;`}
>
  <article class="playback-card plain">
    <header class="panel-header">
      <div class="header-content">
        <div class="header-top">
          <h2>Review</h2>
          {#if $currentProject}
            <div class="project-badge">
              <div class="pulse-dot"></div>
              <span>{$currentProject.name || 'Untitled Project'}</span>
              <button 
                class="exit-btn"
                on:click={() => currentProject.set(null)}
                title="Finish Project & Reset"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/if}
        </div>
        <p>Use the timeline to scrub. The screen asset plays back directly with a live pointer overlay.</p>
      </div>
      <ReviewHeaderActions
        {onSaveProject}
        {isSavingProject}
        {projectSaved}
        {onContinueRecording}
        {canContinueRecording}
        {onOpenZoomEditor}
        {isZoomEditorOpen}
      />
    </header>
    <div class="player-frame narrow" bind:this={playerFrameEl} on:mousemove={zoomEditorController.updatePointerFocus}>
      {#if isZoomEditorOpen}
        <ZoomEditorOverlay isRecording={isZoomRecording} onExit={onCloseZoomEditor} />
      {/if}
      <CompositePlayer
        bind:this={player}
        assets={assets}
        canvasSize={canvasSize}
        generalLayoutState={generalLayoutState}
        screenLayoutState={screenLayoutState}
        webcamLayoutState={webcamLayoutState}
        theme={theme}
        background={background}
        snapshot={snapshot}
        {segments}
        {transcript}
        pointerIconUrl={pointerIconImageUrl}
        pointerIconPressedUrl={pointerIconPressedImageUrl}
        bind:duration
        bind:currentTime
        bind:screenWidth
        bind:screenHeight
      />
    </div>

    <Timeline
      duration={timelineDuration}
      currentTime={currentTime}
      onAddZoomForClick={addZoomForClick}
      onSeek={(t) => {
        console.log('Timeline seek to:', t);
        // TODO: call player.seekTo(t) or equivalent
      }}
      {segments}
      {onSegmentTrimChange}
    />
  </article>
</section>

<style>
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
    align-items: center;
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

  .header-top {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .project-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.6rem;
    background: #eef2ff;
    border: 1px solid #e0e7ff;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 700;
    color: #4338ca;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #6366f1;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .5; }
  }

  .exit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem;
    margin-right: -0.15rem;
    border-radius: 4px;
    color: #818cf8;
    cursor: pointer;
    transition: all 0.15s;
    background: transparent;
    border: none;
  }

  .exit-btn:hover {
    background: #e0e7ff;
    color: #4338ca;
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

  .review-main.zoom-mode {
    width: 100% !important;
    flex: 1 1 auto !important;
  }

  .review-main.zoom-mode .player-frame {
    margin-top: 0.75rem;
  }

  .review-main.zoom-mode :global(.player-shell) {
    min-height: 65vh;
  }

  @media (max-width: 1024px) {
    .review-main {
      flex: 1 1 auto !important;
      width: auto !important;
      padding-right: 0;
    }
  }

  @media (max-width: 640px) {
    .playback-card { padding: 1rem; }
    .panel-header {
        flex-direction: column;
        align-items: flex-start;
    }
  }
</style>
