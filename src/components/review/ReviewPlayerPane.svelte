<script lang="ts">
  import CompositePlayer from "./CompositePlayer.svelte";
  import Timeline from "../Timeline.svelte";
  import type { PointerEventRecord } from "../../lib/stores";
  import type {
    Background,
    CanvasSize,
    GeneralLayoutState,
    RecordingAssets,
    ScreenState,
    Theme,
    WebcamLayoutState,
  } from "../../lib/stores";
  import type { TimelineSnapshot } from "../../lib/stores/timeline";

  export let assets: RecordingAssets;
  export let canvasSize: CanvasSize;
  export let generalLayoutState: GeneralLayoutState;
  export let screenLayoutState: ScreenState;
  export let webcamLayoutState: WebcamLayoutState;
  export let theme: Theme;
  export let background: Background;
  export let snapshot: TimelineSnapshot;

  export let includeWebcamTrack: boolean;
  export let includePointerTrack: boolean;
  export let includeClickTrack: boolean;
  export let includeAudioTrack: boolean;

  export let transcript: { segments: { startMs: number; endMs: number; text: string }[] } | null = null;
  export let showCaptions: boolean = true;

  export let pointerRecords: PointerEventRecord[] = [];
  export let pointerIconImageUrl: string | null = null;
  export let pointerIconPressedImageUrl: string | null = null;
  export let pointerIndicatorSize: number = 14;

  export let duration = 0;
  export let currentTime = 0;
  export let screenWidth = 0;
  export let screenHeight = 0;

  export let timelineDuration = 0;
  export let sortedClickEvents: PointerEventRecord[] = [];
  export let addZoomForClick: (event: PointerEventRecord, seconds?: number) => void;

  export let playerFrameEl: HTMLDivElement | null = null;

  export let previewWidthPx: number;
</script>

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
        snapshot={snapshot}
        showScreen={true}
        showWebcam={includeWebcamTrack}
        showMouse={includePointerTrack}
        showClicks={includeClickTrack}
        includeAudio={includeAudioTrack}
        {transcript}
        {showCaptions}
        {pointerRecords}
        pointerIconUrl={pointerIconImageUrl}
        pointerIconPressedUrl={pointerIconPressedImageUrl}
        pointerIndicatorSize={pointerIndicatorSize}
        bind:duration
        bind:currentTime
        bind:screenWidth
        bind:screenHeight
      />
    </div>

    <Timeline
      duration={timelineDuration}
      currentTime={currentTime}
      clickEvents={sortedClickEvents}
      onAddZoomForClick={addZoomForClick}
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

  @media (max-width: 1024px) {
    .review-main {
      flex: 1 1 auto !important;
      width: auto !important;
      padding-right: 0;
    }
  }

  @media (max-width: 640px) {
    .playback-card { padding: 1rem; }
  }
</style>
