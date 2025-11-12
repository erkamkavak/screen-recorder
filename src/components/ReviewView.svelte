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
  import type { InputEventRecord, KeyEventRecord, PointerEventRecord } from "../stores";
  import CompositePlayer from "./CompositePlayer.svelte";
  import Timeline from "./Timeline.svelte";
  import { timelineStore } from "../stores/timeline";
  import { onDestroy, onMount } from "svelte";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../utils/zoomDefaults";
import {
  renderCompositeRecording,
  type RenderCompositeOptions,
  type RenderResult,
} from "../utils/renderEditedRecording";
  import { getAssetUrlFromFile, disposeAssetUrl } from "../utils/assetStorage";

  let videoDuration = 0;
  let videoCurrentTime = 0;
  let isRenderingVideo = false;
  let renderProgress = 0;

  const humanDuration = (secondsTotal: number) => {
    if (!isFinite(secondsTotal) || secondsTotal <= 0) return "0s";
    const secs = Math.floor(secondsTotal);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const parts: string[] = [];
    if (h) parts.push(`${h}h`);
    if (m || h) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
  };

  let includePointerTrack = true;
  let includeWebcamTrack = true;
  let includeAudioTrack = true;

  let playerFrameEl: HTMLDivElement | null = null;
  let frameWidth = 0;
  let frameHeight = 0;
  const pointerBufferMs = 250;
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

  $: pointerRecords = $lastRecording
    ? ($lastRecording.events.filter(
        (event): event is PointerEventRecord =>
          event.kind === "pointermove" ||
          event.kind === "click" ||
          event.kind === "pointerdown" ||
          event.kind === "pointerup"
      ) as PointerEventRecord[]).sort((a, b) => a.t - b.t)
    : [];

  const computePointerState = (time: number, events: PointerEventRecord[]) => {
    if (!events.length) {
      return { x: 0.5, y: 0.5, visible: false };
    }

    const targetTime = Math.max(0, time) * 1000;
    let best: PointerEventRecord | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    events.forEach((event) => {
      if (typeof event.x !== "number" || typeof event.y !== "number") return;
      const delta = Math.abs(event.t - targetTime);
      if (delta < bestDelta) {
        best = event;
        bestDelta = delta;
      }
    });

    if (!best || bestDelta > pointerBufferMs) {
      return { x: 0.5, y: 0.5, visible: false };
    }

    return {
      x: Math.min(Math.max(best.x ?? 0.5, 0), 1),
      y: Math.min(Math.max(best.y ?? 0.5, 0), 1),
      visible: true,
    };
  };

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

  const formatTimestamp = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

  const isKeyEvent = (event: InputEventRecord): event is KeyEventRecord =>
    event.kind === "keydown" || event.kind === "keyup";

  const describeEvent = (event: InputEventRecord): string => {
    if (isKeyEvent(event)) {
      return `${event.kind} — ${event.key}`;
    }

    const pointer = event as PointerEventRecord;
    const button = pointer.button ?? 0;
    return `${pointer.kind} — button ${button}`;
  };

  const describeDetails = (event: InputEventRecord): string => {
    if (isKeyEvent(event)) {
      const modifiers = [
        event.ctrl ? "Ctrl" : null,
        event.alt ? "Alt" : null,
        event.shift ? "Shift" : null,
        event.meta ? "Meta" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      const modifierLabel = modifiers ? ` (${modifiers})` : "";
      return `code: ${event.code || "n/a"}${modifierLabel}`;
    }

    const pointer = event as PointerEventRecord;
    if (pointer.x !== undefined && pointer.y !== undefined) {
      const x = (pointer.x * 100).toFixed(1);
      const y = (pointer.y * 100).toFixed(1);
      return `position: ${x}%, ${y}%`;
    }

    return "";
  };

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

  const downloadEvents = () => {
    if (!$lastRecording) return;
    const blob = new Blob([JSON.stringify($lastRecording.events, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "events.json";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 500);
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

{#if $lastRecording}
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
            assets={$lastRecording.assets}
            canvasSize={$canvasDimensions}
            generalLayoutState={$generalLayoutState}
            screenLayoutState={$screenLayoutState}
            webcamLayoutState={$webcamLayoutState}
            theme={$activeTheme}
            background={$activeBackground}
            snapshot={currentSnapshot}
            showScreen={true}
            showWebcam={includeWebcamTrack}
            showMouse={includePointerTrack}
            includeAudio={includeAudioTrack}
            frameRate={$recordingFPS}
            bind:duration={videoDuration}
            bind:currentTime={videoCurrentTime}
          />
          <div class="pointer-indicator" style={pointerStyle} />
        </div>


        <Timeline duration={videoDuration} currentTime={videoCurrentTime} clickEvents={clickEvents} />

        {#if sortedClickEvents.length}
          <div class="click-actions">
            <div class="click-actions-header">
              <h3>Clicks</h3>
              <span class="click-count">{sortedClickEvents.length}</span>
            </div>
            <ul>
              {#each sortedClickEvents as clickEvent}
                <li>
                  <div>
                    <span class="click-time">{formatTimestamp(clickEvent.t)}</span>
                    {#if clickEvent.x !== undefined && clickEvent.y !== undefined}
                      <span class="click-pos">{(clickEvent.x * 100).toFixed(1)}% × {(clickEvent.y * 100).toFixed(1)}%</span>
                    {/if}
                  </div>
                  <button class="link-button" on:click={() => addZoomForClick(clickEvent)}>
                    Add zoom
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
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
          <dd>{humanDuration(Math.round($lastRecording.duration / 1000))}</dd>
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
    border-radius: 0;
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
    margin-left: auto;
    margin-right: auto;
  }

  .pointer-indicator {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #f97316;
    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.4);
    pointer-events: none;
    transition: opacity 0.2s ease;
    transform: translate(-50%, -50%);
  }

  .click-actions {
    margin-top: 1rem;
  }

  .click-actions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .click-actions ul {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .click-actions li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
  }

  .click-time {
    font-weight: 600;
  }

  .click-pos {
    font-size: 0.8rem;
    color: #64748b;
  }

  .link-button {
    background: none;
    border: none;
    color: #6366f1;
    font-weight: 600;
    cursor: pointer;
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
  .toggle-group .cb { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; color: #334155; }
  .cb-input { appearance: none; width: 18px; height: 18px; border: 2px solid #94a3b8; border-radius: 6px; display: inline-block; position: relative; background: #fff; }
  .cb-input:checked { background: #111827; border-color: #111827; }
  .cb-input:checked::after { content: ""; position: absolute; left: 4px; top: 0px; width: 6px; height: 12px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }

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
