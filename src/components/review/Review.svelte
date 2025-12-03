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

</script>

{#if lastRecording && assets}
  <div class="review-root">
    <section class="review-main">
      <article class="playback-card plain">
        <header class="panel-header">
          <div>
            <h2>Playback</h2>
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
            bind:duration={videoDuration}
            bind:currentTime={videoCurrentTime}
            bind:screenWidth={screenWidth}
            bind:screenHeight={screenHeight}
          />
          <div class="pointer-indicator" style={pointerStyle} />
        </div>

        <Timeline
          duration={timelineDuration}
          currentTime={videoCurrentTime}
          clickEvents={sortedClickEvents}
          onAddZoomForClick={addZoomForClick}
        />
      </article>
    </section>

    <aside class="review-aside">
      <h1>Export options</h1>
      <p class="aside-text">Control the preview and export, then download the edited video.</p>

      <div class="toggle-group">
        <label class="cb"><input type="checkbox" class="cb-input" bind:checked={includePointerTrack} /> <span>Include pointer</span></label>
        <label class="cb"><input type="checkbox" class="cb-input" bind:checked={includeWebcamTrack} /> <span>Include webcam</span></label>
        <label class="cb"><input type="checkbox" class="cb-input" bind:checked={includeAudioTrack} /> <span>Include audio</span></label>
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
            Download edited video
          {/if}
        </button>
        <button class="danger" on:click={resetToRecorder}>Back to recorder</button>
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
    <button class="primary" on:click={resetToRecorder}>Back to recorder</button>
  </div>
{/if}

<style>
  .review-root {
    display: flex;
    gap: 2rem;
    padding: 1rem 2rem 2rem;
    background: #f6f7fb;
    min-height: 100vh;
    box-sizing: border-box;
  }

  .review-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
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
    max-width: 980px;
    margin: 0 auto;
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
    width: 22rem;
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

  .toggle-group { display: grid; gap: 0.5rem; }
  .toggle-group .cb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    color: #334155;
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
  .danger {
    border-radius: 10px;
    font-weight: 600;
    padding: 0.7rem 1rem;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .primary { background: #111827; color: #fff; }
  .primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .danger { background: #ef4444; color: #fff; }

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
    }

    .review-aside {
      position: static;
      width: 100%;
    }
  }

  @media (max-width: 640px) {
    .playback-card { padding: 1rem; }
  }
</style>
