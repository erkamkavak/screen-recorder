<script lang="ts">
  import { timelineStore } from "../stores/timeline";
  import type { PointerEventRecord } from "../stores";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../utils/zoomDefaults";
  import { findZoomEventForTime } from "../utils/zoomEvents";

  export let duration = 0;
  export let currentTime = 0;
  export let clickEvents: PointerEventRecord[] = [];
  export let onAddZoomForClick: ((clickEvent: PointerEventRecord) => void) | null = null;

  // log click events for debugging
  $: console.log("Timeline click events:", clickEvents);

  let zoomDraft = false;
  let trackEl: HTMLDivElement | null = null;
  let draggingTrim: "start" | "end" | null = null;
  let selectedClickIndex: number | null = null;
  let hoveredClickEvent: PointerEventRecord | null = null;

  $: canUndo = $timelineStore.historyIndex > 0;
  $: canRedo = $timelineStore.historyIndex < $timelineStore.history.length - 1;
  $: trimStart = $timelineStore.trimStart;
  $: trimEnd = $timelineStore.trimEnd ?? duration;
  $: timeMarkers = duration > 0
    ? Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, index) => index * 5)
    : [];

  const clampTime = (time: number) => Math.max(0, Math.min(duration, time));

  const getPositionPercent = (seconds: number) => {
    if (duration <= 0) return 0;
    return (seconds / duration) * 100;
  };

  const pointerSeries = (events: PointerEventRecord[]) =>
    events.filter(
      (event) =>
        event.kind === "pointermove" ||
        event.kind === "click" ||
        event.kind === "pointerdown"
    );

  const formatTime = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const focusForTime = (seconds: number) => {
    const events = pointerSeries(clickEvents);
    if (!events.length) return { x: 0.5, y: 0.5 };

    const target = clampTime(seconds);
    let closest = events[0];
    let minDelta = Math.abs(closest.t / 1000 - target);

    for (const event of events) {
      const delta = Math.abs(event.t / 1000 - target);
      if (delta < minDelta) {
        minDelta = delta;
        closest = event;
      }
    }

    return {
      x: typeof closest.x === "number" ? closest.x : 0.5,
      y: typeof closest.y === "number" ? closest.y : 0.5,
    };
  };

  const screenXToTime = (clientX: number) => {
    if (!trackEl || duration <= 0) return 0;
    const rect = trackEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampTime(ratio * duration);
  };

  const addZoomAt = (seconds: number) => {
    const focus = focusForTime(seconds);
    const clampedDuration = Math.min(ZOOM_DEFAULT_DURATION, duration || ZOOM_DEFAULT_DURATION);
    const startTime = clampTime(seconds - clampedDuration / 2);

    timelineStore.addZoom({
      startTime,
      duration: Math.max(0.1, clampedDuration),
      focusX: focus.x,
      focusY: focus.y,
      zoom: ZOOM_DEFAULT_SCALE,
      label: "Zoom",
    });
  };

  const handleZoomPlacement = (event: MouseEvent | KeyboardEvent) => {
    if (!zoomDraft) return;

    const seconds =
      event instanceof MouseEvent ? screenXToTime(event.clientX) : clampTime(currentTime);

    addZoomAt(seconds);
    zoomDraft = false;
  };

  const handleTrimPointerDown = (event: PointerEvent, edge: "start" | "end") => {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    draggingTrim = edge;
  };

  const handlePointerDrag = (event: PointerEvent) => {
    if (!draggingTrim || duration <= 0) return;
    const seconds = screenXToTime(event.clientX);
    timelineStore.setTrim(draggingTrim, seconds, duration);
  };

  const endTrimDrag = () => {
    draggingTrim = null;
  };

  const handleClickMarker = (index: number, clickEvent: PointerEventRecord) => {
    const seconds = clampTime(clickEvent.t / 1000);
    const existingZoom = findZoomEventForTime($timelineStore.events, seconds);
    if (existingZoom) {
      timelineStore.selectEvent(existingZoom.id);
      return;
    }
    selectedClickIndex = index;
    onAddZoomForClick?.(clickEvent);
    selectedClickIndex = null;
  };

  const handleEventClick = (eventId: string, event: MouseEvent) => {
    event.stopPropagation();
    timelineStore.selectEvent($timelineStore.selectedEventId === eventId ? null : eventId);
  };

  const handleEventKeydown = (eventId: string) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      timelineStore.selectEvent($timelineStore.selectedEventId === eventId ? null : eventId);
    }
  };

  const deleteTimelineEvent = (eventId: string, event: MouseEvent) => {
    event.stopPropagation();
    timelineStore.deleteEvent(eventId);
  };

  const resetTimeline = () => {
    if (confirm("Reset timeline edits?")) {
      timelineStore.reset();
    }
  };

  const triggerTrimAtCurrent = (edge: "start" | "end") => {
    timelineStore.setTrim(edge, currentTime, duration);
  };
</script>

<svelte:window on:pointermove={handlePointerDrag} on:pointerup={endTrimDrag} />

<div class="timeline-container">
  <div class="timeline-toolbar">
    <button
      class="toolbar-btn primary"
      class:active={zoomDraft}
      on:click={() => (zoomDraft = !zoomDraft)}
      title={zoomDraft ? "Click timeline to place zoom" : "Add zoom"}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
      {zoomDraft ? "Pick a time" : "Place zoom"}
    </button>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn icon" title="Trim start to current time" on:click={() => triggerTrimAtCurrent("start")}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h4v16H4z" />
        <path d="M8 12h12" />
      </svg>
    </button>

    <button class="toolbar-btn icon" title="Trim end to current time" on:click={() => triggerTrimAtCurrent("end")}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 4h4v16h-4z" />
        <path d="M4 12h12" />
      </svg>
    </button>

    <div class="toolbar-divider"></div>

    <button
      class="toolbar-btn icon"
      title="Delete selected event"
      disabled={!$timelineStore.selectedEventId}
      on:click={() => $timelineStore.selectedEventId && timelineStore.deleteEvent($timelineStore.selectedEventId)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn icon" title="Undo" disabled={!canUndo} on:click={() => timelineStore.undo()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
      </svg>
    </button>

    <button class="toolbar-btn icon" title="Redo" disabled={!canRedo} on:click={() => timelineStore.redo()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 7v6h-6" />
        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
      </svg>
    </button>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn icon" title="Reset timeline" on:click={resetTimeline}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 4v6h6" />
        <path d="M23 20v-6h-6" />
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
      </svg>
    </button>
  </div>

  <div
    class="timeline-track"
    bind:this={trackEl}
    role="button"
    tabindex="0"
    on:click={handleZoomPlacement}
    on:keydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleZoomPlacement(event);
      }
    }}
  >
    <div class="time-markers">
      {#each timeMarkers as marker}
        <div class="time-marker" style={`left: ${getPositionPercent(marker)}%`}>
          <span class="marker-tick"></span>
          <span class="marker-label">{formatTime(marker)}</span>
        </div>
      {/each}
    </div>

    <div
      class="trim-range"
      style={`left: ${getPositionPercent(trimStart)}%; width: ${Math.max(0, getPositionPercent(trimEnd) - getPositionPercent(trimStart))}%`}
    ></div>

    <button
      class="trim-handle"
      style={`left: ${getPositionPercent(trimStart)}%`}
      on:pointerdown={(event) => handleTrimPointerDown(event, "start")}
      title="Adjust start trim"
    ></button>

    <button
      class="trim-handle"
      style={`left: ${getPositionPercent(trimEnd)}%`}
      on:pointerdown={(event) => handleTrimPointerDown(event, "end")}
      title="Adjust end trim"
    ></button>

    <div class="click-lines-layer">
      {#each clickEvents as clickEvent, index}
        {@const seconds = clampTime(clickEvent.t / 1000)}
        {@const clickZoomEvent = findZoomEventForTime($timelineStore.events, seconds)}
        <button
          type="button"
          class="click-line"
          class:has-zoom={Boolean(clickZoomEvent)}
          class:selected={selectedClickIndex === index}
          style={`left: ${getPositionPercent(seconds)}%`}
          on:pointerenter={() => {
            hoveredClickEvent = clickEvent;
          }}
          on:pointerleave={() => {
            hoveredClickEvent = null;
          }}
          on:click={(event) => {
            event.stopPropagation();
            handleClickMarker(index, clickEvent);
          }}
          title={`Click at ${formatTime(seconds)}`}
        ></button>
      {/each}
      {#if hoveredClickEvent}
        {@const bubbleSeconds = clampTime(hoveredClickEvent.t / 1000)}
        {@const hoveredZoomEvent = findZoomEventForTime($timelineStore.events, bubbleSeconds)}
        <div class="click-tooltip" style={`left: ${getPositionPercent(bubbleSeconds)}%`}>
          <span>{hoveredZoomEvent ? "Zoom already added" : "Add zoom"}</span>
        </div>
      {/if}
    </div>

    <div class="events-layer">
      {#each $timelineStore.events as timelineEvent (timelineEvent.id)}
        {@const startPercent = getPositionPercent(timelineEvent.startTime)}
        {@const widthPercent = Math.max(
          0.75,
          getPositionPercent(timelineEvent.startTime + timelineEvent.duration) - startPercent
        )}
        <div
          role="button"
          tabindex="0"
          class="timeline-event zoom"
          class:selected={$timelineStore.selectedEventId === timelineEvent.id}
          style={`left: ${startPercent}%; width: ${widthPercent}%`}
          on:click={(event) => handleEventClick(timelineEvent.id, event)}
          on:keydown={handleEventKeydown(timelineEvent.id)}
          title={timelineEvent.label ?? "Zoom"}
        >
          <span class="event-label">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            {timelineEvent.label ?? "Zoom"}
          </span>

          {#if $timelineStore.selectedEventId === timelineEvent.id}
            <button
              class="delete-event-btn"
              on:click={(event) => deleteTimelineEvent(timelineEvent.id, event)}
              title="Delete event"
              type="button"
            >
              ×
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="current-time-indicator" style={`left: ${getPositionPercent(currentTime)}%`}></div>
  </div>
</div>

<style>
  .timeline-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .timeline-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toolbar-btn.primary {
    background: #111827;
    color: white;
    border-color: #111827;
  }

  .toolbar-btn.primary:hover:not(:disabled) {
    background: #1f2937;
  }

  .toolbar-btn.primary.active {
    background: #3b82f6;
    border-color: #3b82f6;
  }

  .toolbar-btn.icon {
    padding: 0.5rem;
  }

  .toolbar-divider {
    width: 1px;
    height: 1.5rem;
    background: #d1d5db;
  }

  .timeline-track {
    position: relative;
    height: 120px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0 0.5rem;
    overflow: visible;
  }

  .time-markers {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .time-marker {
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .marker-tick {
    width: 1px;
    height: 12px;
    background: #d1d5db;
    margin-top: 6px;
  }

  .marker-label {
    font-family: "Roboto Mono", monospace;
    font-size: 0.7rem;
    color: #6b7280;
    margin-top: 2px;
  }

  .trim-range {
    position: absolute;
    top: 40px;
    height: 48px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px dashed rgba(59, 130, 246, 0.4);
    pointer-events: none;
    border-radius: 4px;
    z-index: 1;
  }

  .trim-handle {
    position: absolute;
    top: 34px;
    width: 12px;
    height: 60px;
    background: #111827;
    border: 2px solid white;
    border-radius: 4px;
    transform: translateX(-50%);
    cursor: ew-resize;
    z-index: 3;
  }

  .click-lines-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
  }

  .click-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 16px;
    transform: translateX(-50%);
    border: none;
    cursor: pointer;
    pointer-events: all;
    background: transparent;
  }

  .click-line::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 12px;
    bottom: 12px;
    width: 2px;
    background: #ef4444;
    transform: translateX(-50%);
    opacity: 0.35;
    border-radius: 999px;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.35);
    transition: opacity 0.2s ease;
  }

  .click-line.has-zoom::before {
    background: #f59e0b;
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.35);
  }

  .click-line:hover::before,
  .click-line.selected::before {
    opacity: 1;
  }

  .click-tooltip {
    position: absolute;
    top: 12px;
    transform: translate(-50%, -120%);
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 600;
    color: white;
    background: #111827;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    pointer-events: none;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.2);
    z-index: 6;
  }

  .events-layer {
    position: absolute;
    top: 64px;
    left: 0;
    right: 0;
    height: 44px;
    z-index: 1;
  }

  .timeline-event {
    position: absolute;
    height: 34px;
    border-radius: 4px;
    border: 2px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0 0.6rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: rgba(147, 197, 253, 0.5);
    border-color: #3b82f6;
    color: #1f2937;
    cursor: pointer;
    transition: filter 0.15s ease;
  }

  .timeline-event.selected {
    border-width: 3px;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  }

  .timeline-event:hover {
    filter: brightness(0.95);
  }

  .event-label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .delete-event-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ef4444;
    color: #ffffff;
    border: none;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .current-time-indicator {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ef4444;
    pointer-events: none;
    z-index: 4;
  }

  .current-time-indicator::before {
    content: "";
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
  }

  @media (max-width: 640px) {
    .timeline-container {
      padding: 0.75rem;
    }

    .timeline-track {
      height: 100px;
    }
  }
</style>
