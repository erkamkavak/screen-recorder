<script lang="ts">
  import { appView, lastRecording } from "../stores";
  import type { InputEventRecord, KeyEventRecord, PointerEventRecord } from "../stores";
  import VideoPlayer from "./VideoPlayer.svelte";
  import Timeline from "./Timeline.svelte";
  import { timelineStore } from "../stores/timeline";
  import { onDestroy } from "svelte";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../utils/zoomDefaults";
  import { renderEditedRecording } from "../utils/renderEditedRecording";
  import { patchBlob } from "../utils/blobHelpers";

  let videoDuration = 0;
  let videoCurrentTime = 0;
  let isRenderingVideo = false;
  let renderProgress = 0;

  $: clickEvents = $lastRecording
    ? ($lastRecording.events.filter(
        (event) => event.kind === "click"
      ) as PointerEventRecord[])
    : [];

  $: sortedClickEvents = [...clickEvents].sort((a, b) => a.t - b.t);

  onDestroy(() => {
    timelineStore.reset();
  });

  const formatTimestamp = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

  const isKeyEvent = (event: InputEventRecord): event is KeyEventRecord =>
    event.kind === "keydown" || event.kind === "keyup";

  const isPointerEvent = (
    event: InputEventRecord
  ): event is PointerEventRecord =>
    event.kind === "click" ||
    event.kind === "pointerdown" ||
    event.kind === "pointerup" ||
    event.kind === "pointermove";

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

  const downloadEvents = () => {
    if (!$lastRecording) return;
    const blob = new Blob(
      [JSON.stringify($lastRecording.events, null, 2)],
      { type: "application/json" }
    );
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

  const downloadVideo = () => {
    if (!$lastRecording || isRenderingVideo) return;
    void downloadEditedVideo();
  };

  const resetToRecorder = () => {
    $appView = "recorder";
  };
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

  const formatClickPosition = (event: PointerEventRecord) => {
    if (typeof event.x !== "number" || typeof event.y !== "number") return "";
    return `${(event.x * 100).toFixed(1)}% × ${(event.y * 100).toFixed(1)}%`;
  };

  const ensureEditedFileName = (fileName: string) => {
    if (!fileName) return "edited-video.webm";
    const dot = fileName.lastIndexOf(".");
    if (dot > 0 && dot < fileName.length - 1) {
      return `${fileName.slice(0, dot)}-edited${fileName.slice(dot)}`;
    }
    return `${fileName}-edited.webm`;
  };

  const downloadEditedVideo = async () => {
    if (!$lastRecording || isRenderingVideo) return;
    isRenderingVideo = true;
    renderProgress = 0;

    const snapshot = timelineStore.snapshot();
    const trimStart = Math.max(0, snapshot.trimStart);
    const trimEnd = Math.min(snapshot.trimEnd ?? videoDuration, videoDuration);
    const effectiveDuration = Math.max(0.1, trimEnd - trimStart || videoDuration || 0.1);

    try {
      const editedBlob = await renderEditedRecording($lastRecording.videoUrl, videoDuration, snapshot, {
        onProgress: (current, end) => {
          if (!end) {
            renderProgress = 0;
            return;
          }
          const percent = Math.min(100, Math.max(0, Math.round((current / end) * 100)));
          renderProgress = percent;
        },
      });
      const patchedBlob = await patchBlob(editedBlob, effectiveDuration * 1000);

      const url = URL.createObjectURL(patchedBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = ensureEditedFileName($lastRecording.fileName);
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
    }
  };
</script>

{#if $lastRecording}
  <div class="review-root">
    <main class="review-main">
      <section class="playback-panel">
        <header class="panel-header">
          <div>
            <h2>Playback</h2>
            <p>Use the timeline to scrub. Click the video to play or pause.</p>
          </div>
          <button class="ghost" on:click={downloadVideo} disabled={isRenderingVideo}>
            {#if isRenderingVideo}
              Rendering…
            {:else}
              Download edited video
            {/if}
          </button>
        </header>
        <VideoPlayer 
          src={$lastRecording.videoUrl} 
          events={$lastRecording.events}
          bind:duration={videoDuration}
          bind:currentTime={videoCurrentTime}
        />
        
        <Timeline 
          duration={videoDuration}
          currentTime={videoCurrentTime}
          clickEvents={clickEvents}
        />

        {#if sortedClickEvents.length}
          <div class="click-actions">
            <div class="click-actions-header">
              <h3>Click actions</h3>
              <span class="click-count">{sortedClickEvents.length}</span>
            </div>
            <p class="click-actions-help">Add zoom transitions aligned to recorded clicks.</p>
            <ul>
              {#each sortedClickEvents as clickEvent, index}
                <li>
                  <div class="click-meta">
                    <span class="click-time">{formatTimestamp(clickEvent.t)}</span>
                    {#if formatClickPosition(clickEvent)}
                      <span class="click-pos">{formatClickPosition(clickEvent)}</span>
                    {/if}
                  </div>
                  <div class="click-row-actions">
                    <button
                      type="button"
                      class="link-button"
                      on:click={() => addZoomForClick(clickEvent)}
                    >
                      Add zoom
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </section>

      <section class="log-panel">
        <header class="panel-header">
          <div>
            <h2>Event log</h2>
            <p>Keyboard shortcuts and clicks captured during the session.</p>
          </div>
          <span class="badge">{$lastRecording.events.length} events</span>
        </header>

        {#if $lastRecording.events.length}
          <div class="events-table">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {#each $lastRecording.events as event, index}
                  <tr class:index={index % 2 === 1}>
                    <td>{formatTimestamp(event.t)}</td>
                    <td>{describeEvent(event)}</td>
                    <td>
                      {#if describeDetails(event)}
                        {describeDetails(event)}
                      {:else}
                        <span class="muted">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty-state">
            <p>No input events captured. Interact with the recorded app to see events here.</p>
          </div>
        {/if}
      </section>
    </main>

    <aside class="review-aside">
      <h1>Recording summary</h1>
      <p class="aside-text">
        Export artifacts or head back to the recorder to run another take.
      </p>

      <div class="button-stack">
        <button class="primary" on:click={downloadVideo} disabled={isRenderingVideo}>
          {#if isRenderingVideo}
            Rendering video…
          {:else}
            Download edited video
          {/if}
        </button>
        <button class="secondary" on:click={downloadEvents}>Export events JSON</button>
        <button class="ghost" on:click={resetToRecorder}>Back to recorder</button>
      </div>

      {#if isRenderingVideo}
        <div class="render-progress">Preparing download… {renderProgress}%</div>
      {/if}

      <dl class="stats">
        <div>
          <dt>Last event time</dt>
          <dd>{formatTimestamp($lastRecording.events.at(-1)?.t ?? 0)}</dd>
        </div>
        <div>
          <dt>Events captured</dt>
          <dd>{$lastRecording.events.length}</dd>
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
    height: 100%;
    display: flex;
    gap: 2rem;
    padding: 0 32px 32px;
    background: #ffffff;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .review-main {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .playback-panel,
  .log-panel {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.25rem;
  }

  .panel-header h2 {
    font-size: 1.1rem;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 0.25rem;
  }

  .panel-header p {
    font-size: 0.9rem;
    color: #475569;
    margin: 0;
  }

  .badge {
    align-self: center;
    padding: 0.2rem 0.65rem;
    border-radius: 9999px;
    background: #eef2ff;
    color: #3730a3;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .events-table {
    max-height: 340px;
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .events-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .events-table thead {
    background: #f8fafc;
    position: sticky;
    top: 0;
  }

  .events-table th {
    text-align: left;
    padding: 0.65rem 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .events-table td {
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    color: #334155;
    vertical-align: top;
  }

  .events-table tr.index {
    background: #f9fafb;
  }

  .events-table td:first-child {
    font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.78rem;
    color: #1f2937;
    white-space: nowrap;
  }

  .muted {
    color: #94a3b8;
  }

  .empty-state {
    padding: 3rem 1.5rem;
    text-align: center;
    color: #64748b;
    font-size: 0.95rem;
  }

  .click-actions {
    padding: 1.25rem;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .click-actions-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .click-actions-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #0f172a;
  }

  .click-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    background: #e0e7ff;
    color: #3730a3;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .click-actions-help {
    margin: 0;
    font-size: 0.85rem;
    color: #475569;
  }

  .click-actions ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .click-actions li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.6rem 0.9rem;
  }

  .click-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .click-time {
    font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.8rem;
    color: #0f172a;
  }

  .click-pos {
    font-size: 0.8rem;
    color: #475569;
  }

  .click-row-actions {
    display: flex;
    align-items: center;
  }

  .link-button {
    border: none;
    background: transparent;
    color: #2563eb;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .link-button:hover {
    text-decoration: underline;
  }

  .render-progress {
    font-size: 0.85rem;
    color: #2563eb;
  }

  .review-aside {
    width: min(320px, 32%);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: sticky;
    top: 32px;
    align-self: flex-start;
  }

  .review-aside h1 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #0f172a;
  }

  .aside-text {
    font-size: 0.9rem;
    color: #475569;
    line-height: 1.5;
  }

  .button-stack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .primary,
  .secondary,
  .ghost {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    padding: 0.6rem 0.9rem;
    font-size: 0.9rem;
    font-weight: 500;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .primary {
    background: #111827;
    color: #ffffff;
  }

  .primary:hover {
    background: #1f2937;
  }

  .secondary {
    background: #f8fafc;
    border-color: #d0d7e6;
    color: #1e293b;
  }

  .secondary:hover {
    background: #e2e8f0;
  }

  .ghost {
    background: transparent;
    color: #1e293b;
    justify-content: flex-start;
    padding-inline: 0;
  }

  .ghost:hover {
    color: #111827;
  }

  .stats {
    display: grid;
    gap: 0.9rem;
    font-size: 0.9rem;
    color: #1e293b;
  }

  .stats dt {
    font-size: 0.8rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stats dd {
    font-size: 1rem;
    font-weight: 600;
    margin: 0.15rem 0 0;
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

  .fallback p {
    font-size: 1rem;
    color: #475569;
  }

  @media (max-width: 1024px) {
    .review-root {
      flex-direction: column;
    }

    .review-aside {
      position: static;
      width: 100%;
      align-self: stretch;
    }
  }

  @media (max-width: 640px) {
    .panel-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .panel-header .badge {
      margin-left: 0;
    }
  }
</style>
