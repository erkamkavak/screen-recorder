<script lang="ts">
  import { timelineStore } from "../stores/timeline";
  import type { PointerEventRecord } from "../stores";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../utils/zoomDefaults";
  import { findZoomEventForTime } from "../utils/zoomEvents";

  export let duration = 0;
  export let currentTime = 0;
  export let clickEvents: PointerEventRecord[] = [];
  export let onAddZoomForClick: ((clickEvent: PointerEventRecord, seconds?: number) => void) | null = null;

  let zoomDraft = false;
  let trackEl: HTMLDivElement | null = null;
  
  // Drag state
  interface DragState {
    type: "trim" | "event-move" | "event-resize-start" | "event-resize-end";
    id?: string; // event id for event ops
    startX: number;
    initialTime: number;
    initialDuration?: number;
  }

  let dragState: DragState | null = null;
  let suppressedClickEventId: string | null = null;
  let eventDragOccurred = false;
  
  // Local overrides for smooth dragging without committing to store constantly
  let optimisticEvent: { id: string; startTime: number; duration: number } | null = null;

  let selectedClickIndex: number | null = null;
  let hoveredClickEvent: PointerEventRecord | null = null;

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

  $: canUndo = $timelineStore.historyIndex > 0;
  $: canRedo = $timelineStore.historyIndex < $timelineStore.history.length - 1;
  $: trimStart = $timelineStore.trimStart;
  $: trimEnd = $timelineStore.trimEnd ?? duration;
  $: timeMarkers = duration > 0
    ? Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, index) => index * 5)
    : [];
  type ClickMarker = { event: PointerEventRecord; seconds: number };
  $: orderedClickEvents = [...clickEvents].sort((a, b) => a.t - b.t);
  $: clickMarkers = orderedClickEvents.map((event) => ({
    event,
    seconds: clampTime(event.t / 1000),
  }));

  const focusForTime = (seconds: number) => {
    const events = pointerSeries(clickMarkers.map((marker) => marker.event));
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
  
  const pxToTimeDelta = (px: number) => {
    if (!trackEl || duration <= 0) return 0;
    const rect = trackEl.getBoundingClientRect();
    return (px / rect.width) * duration;
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
    dragState = {
      type: "trim",
      id: edge, // 'start' or 'end'
      startX: event.clientX,
      initialTime: edge === "start" ? trimStart : trimEnd,
    };
  };

  const handleEventPointerDown = (event: PointerEvent, eventId: string, type: "event-move" | "event-resize-start" | "event-resize-end") => {
    event.stopPropagation();
    // Don't prevent default on move to allow click selection, but prevent for resize
    if (type !== 'event-move') {
      event.preventDefault();
    }
    
    const targetEvent = $timelineStore.events.find(e => e.id === eventId);
    if (!targetEvent) return;

    const alreadySelected = $timelineStore.selectedEventId === eventId;
    suppressedClickEventId = alreadySelected ? null : eventId;
    eventDragOccurred = false;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    
    dragState = {
      type,
      id: eventId,
      startX: event.clientX,
      initialTime: targetEvent.startTime,
      initialDuration: targetEvent.duration
    };

    // Set initial optimistic state
    optimisticEvent = {
      id: eventId,
      startTime: targetEvent.startTime,
      duration: targetEvent.duration
    };

    // If resizing or moving, select the event
    timelineStore.selectEvent(eventId);
  };

  const handlePointerDrag = (event: PointerEvent) => {
    if (!dragState || duration <= 0) return;
    
    if (dragState.type !== "trim") {
      eventDragOccurred = true;
    }

    // Handle Trim Dragging
    if (dragState.type === "trim") {
        const seconds = screenXToTime(event.clientX);
        timelineStore.setTrim(dragState.id as "start" | "end", seconds, duration);
        return;
    }

    // Handle Event Dragging/Resizing
    if (dragState.id && optimisticEvent) {
        const deltaT = pxToTimeDelta(event.clientX - dragState.startX);
        
        if (dragState.type === 'event-move') {
            const newStart = Math.max(0, Math.min(duration - optimisticEvent.duration, dragState.initialTime + deltaT));
            optimisticEvent = { ...optimisticEvent, startTime: newStart };
        } else if (dragState.type === 'event-resize-start') {
            // Changing start time affects duration (end time stays fixed)
            const originalEnd = dragState.initialTime + (dragState.initialDuration || 0);
            const newStart = Math.max(0, Math.min(originalEnd - 0.1, dragState.initialTime + deltaT));
            const newDuration = originalEnd - newStart;
            optimisticEvent = { ...optimisticEvent, startTime: newStart, duration: newDuration };
        } else if (dragState.type === 'event-resize-end') {
            // Changing duration only
            const newDuration = Math.max(0.1, Math.min(duration - dragState.initialTime, (dragState.initialDuration || 0) + deltaT));
            optimisticEvent = { ...optimisticEvent, duration: newDuration };
        }
    }
  };

  const endDrag = () => {
    if (!dragState) return;
    
    // Commit changes if we were editing an event
    if (dragState.type.startsWith('event-') && optimisticEvent) {
        timelineStore.updateZoom(optimisticEvent.id, {
            startTime: optimisticEvent.startTime,
            duration: optimisticEvent.duration
        });
    }

    dragState = null;
    optimisticEvent = null;
  };

  const handleClickMarker = (index: number, marker: ClickMarker) => {
    const seconds = marker.seconds;
    const existingZoom = findZoomEventForTime($timelineStore.events, seconds);
    if (existingZoom) {
      timelineStore.selectEvent(existingZoom.id);
      return;
    }
    selectedClickIndex = index;
    onAddZoomForClick?.(marker.event, seconds);
    selectedClickIndex = null;
  };

  const handleEventClick = (eventId: string, event: MouseEvent) => {
    event.stopPropagation();
    if (!dragState) {
        if (eventDragOccurred) {
            eventDragOccurred = false;
            suppressedClickEventId = null;
            return;
        }
        if (suppressedClickEventId === eventId) {
            suppressedClickEventId = null;
            return;
        }
        suppressedClickEventId = null;
        timelineStore.selectEvent($timelineStore.selectedEventId === eventId ? null : eventId);
    }
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

  // Helper to get display props for an event (store state vs optimistic drag state)
  $: getEventDisplay = (event: any) => {
    if (optimisticEvent && optimisticEvent.id === event.id) {
        return optimisticEvent;
    }
    return event;
  };
</script>

<svelte:window on:pointermove={handlePointerDrag} on:pointerup={endDrag} />

<div class="timeline-container">
  <div class="timeline-toolbar">
    <button
      class="toolbar-btn primary"
      class:active={zoomDraft}
      on:click={() => (zoomDraft = !zoomDraft)}
      title={zoomDraft ? "Click timeline to place zoom" : "Add zoom"}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
      {zoomDraft ? "Pick a time" : "Add Zoom"}
    </button>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn icon" title="Trim start to current time" on:click={() => triggerTrimAtCurrent("start")}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h4v16H4z" />
        <path d="M8 12h12" />
      </svg>
    </button>

    <button class="toolbar-btn icon" title="Trim end to current time" on:click={() => triggerTrimAtCurrent("end")}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 4h4v16h-4z" />
        <path d="M4 12h12" />
      </svg>
    </button>

    <div class="toolbar-divider"></div>

    <button
      class="toolbar-btn icon danger-hover"
      title="Delete selected event"
      disabled={!$timelineStore.selectedEventId}
      on:click={() => $timelineStore.selectedEventId && timelineStore.deleteEvent($timelineStore.selectedEventId)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>

    <div class="spacer"></div>

    <button class="toolbar-btn icon" title="Undo" disabled={!canUndo} on:click={() => timelineStore.undo()}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
      </svg>
    </button>

    <button class="toolbar-btn icon" title="Redo" disabled={!canRedo} on:click={() => timelineStore.redo()}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 7v6h-6" />
        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
      </svg>
    </button>

    <div class="toolbar-divider"></div>

    <button class="toolbar-btn icon" title="Reset timeline" on:click={resetTimeline}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
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
      {#each clickMarkers as marker, index}
        {@const seconds = marker.seconds}
        {@const clickZoomEvent = findZoomEventForTime($timelineStore.events, seconds)}
        <button
          type="button"
          class="click-line"
          class:has-zoom={Boolean(clickZoomEvent)}
          class:selected={selectedClickIndex === index}
          style={`left: ${getPositionPercent(seconds)}%`}
          on:pointerenter={() => {
            hoveredClickEvent = marker.event;
          }}
          on:pointerleave={() => {
            hoveredClickEvent = null;
          }}
          on:click={(event) => {
            event.stopPropagation();
            handleClickMarker(index, marker);
          }}
          title={`Click at ${formatTime(seconds)}`}
        >
          {#if hoveredClickEvent === marker.event}
            <div class="click-tooltip">
              <span>{clickZoomEvent ? "Zoom already added" : "Add zoom"}</span>
            </div>
          {/if}
        </button>
      {/each}
    </div>

    <div class="events-layer">
      {#each $timelineStore.events as rawEvent (rawEvent.id)}
        {@const timelineEvent = getEventDisplay(rawEvent)}
        {@const startPercent = getPositionPercent(timelineEvent.startTime)}
        {@const widthPercent = Math.max(
          0.75,
          getPositionPercent(timelineEvent.startTime + timelineEvent.duration) - startPercent
        )}
        {@const isSelected = $timelineStore.selectedEventId === timelineEvent.id}
        
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
          role="button"
          tabindex="0"
          class="timeline-event zoom"
          class:selected={isSelected}
          class:dragging={dragState?.id === timelineEvent.id}
          style={`left: ${startPercent}%; width: ${widthPercent}%`}
          on:pointerdown={(e) => handleEventPointerDown(e, timelineEvent.id, 'event-move')}
          on:click={(event) => handleEventClick(timelineEvent.id, event)}
          on:keydown={handleEventKeydown(timelineEvent.id)}
          title={timelineEvent.label ?? "Zoom"}
        >
          <span class="event-label">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span class="label-text">{timelineEvent.label ?? "Zoom"}</span>
          </span>

          {#if isSelected}
             <!-- Resize Handles -->
             <div 
               class="resize-handle start"
               on:pointerdown={(e) => handleEventPointerDown(e, timelineEvent.id, 'event-resize-start')}
               on:click|stopPropagation
               title="Drag to change start time"
             ></div>
             <div 
               class="resize-handle end"
               on:pointerdown={(e) => handleEventPointerDown(e, timelineEvent.id, 'event-resize-end')}
               on:click|stopPropagation
               title="Drag to change duration"
             ></div>

            <button
              class="delete-event-btn"
              on:click={(event) => deleteTimelineEvent(timelineEvent.id, event)}
              on:pointerdown|stopPropagation
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
    background: #f8fafc; /* Slate 50 */
    border: 1px solid #e2e8f0; /* Slate 200 */
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }

  .timeline-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  
  .spacer {
    flex: 1;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid #e2e8f0; /* Slate 200 */
    background: white;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    color: #475569; /* Slate 600 */
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  }

  .toolbar-btn:hover:not(:disabled) {
    background: #f1f5f9; /* Slate 100 */
    border-color: #cbd5e1; /* Slate 300 */
    color: #1e293b; /* Slate 800 */
  }

  .toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #f8fafc;
  }
  
  .toolbar-btn.danger-hover:hover:not(:disabled) {
    background: #fee2e2;
    color: #b91c1c;
    border-color: #fecaca;
  }

  .toolbar-btn.primary {
    background: #0f172a; /* Slate 900 */
    color: white;
    border-color: #0f172a;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .toolbar-btn.primary:hover:not(:disabled) {
    background: #1e293b; /* Slate 800 */
    border-color: #1e293b;
    color: #f9fafb;
  }

  .toolbar-btn.primary.active {
    background: #4f46e5; /* Indigo 600 */
    border-color: #4f46e5;
  }

  .toolbar-btn.icon {
    padding: 0.4rem;
    min-width: 32px;
  }

  .toolbar-divider {
    width: 1px;
    height: 1.25rem;
    background: #e2e8f0; /* Slate 200 */
    margin: 0 0.25rem;
  }

  .timeline-track {
    position: relative;
    height: 120px;
    background: #ffffff;
    border: 1px solid #cbd5e1; /* Slate 300 */
    border-radius: 8px;
    padding: 0 0.5rem;
    overflow: hidden;
    user-select: none;
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
    height: 10px;
    background: #cbd5e1; /* Slate 300 */
    margin-top: 8px;
  }

  .marker-label {
    font-family: "JetBrains Mono", "Roboto Mono", monospace;
    font-size: 0.65rem;
    color: #94a3b8; /* Slate 400 */
    margin-top: 4px;
  }

  .trim-range {
    position: absolute;
    top: 40px;
    height: 48px;
    background: rgba(99, 102, 241, 0.08); /* Indigo tint */
    border: 1px dashed rgba(99, 102, 241, 0.3);
    pointer-events: none;
    border-radius: 4px;
    z-index: 1;
  }

  .trim-handle {
    position: absolute;
    top: 36px;
    width: 10px;
    height: 56px;
    background: #334155; /* Slate 700 */
    border: 2px solid white;
    border-radius: 4px;
    transform: translateX(-50%);
    cursor: ew-resize;
    z-index: 10;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    transition: transform 0.1s, background 0.1s;
  }
  
  .trim-handle:hover {
    background: #1e293b; /* Slate 800 */
    transform: translateX(-50%) scale(1.1);
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
    width: 20px;
    transform: translateX(-50%);
    border: none;
    cursor: pointer;
    pointer-events: all;
    background: transparent;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0;
  }

  .click-line::before {
    content: "";
    position: absolute;
    top: 16px;
    bottom: 16px;
    width: 2px;
    background: #fbbf24; /* Amber 400 */
    opacity: 0.3;
    border-radius: 999px;
    transition: all 0.2s ease;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .click-line.has-zoom::before {
    background: #f59e0b; /* Amber 500 */
    width: 2px;
    opacity: 0.6;
  }

  .click-line:hover::before {
    opacity: 1;
    width: 3px;
  }
  
  .click-line.selected::before {
    opacity: 1;
    width: 3px;
    background: #d97706; /* Amber 600 */
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.2);
  }

  .click-tooltip {
    position: absolute;
    top: 25%;
    left: 50%;
    transform: translate(-50%, -100%);
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 500;
    color: white;
    background: #1e293b; /* Slate 800 */
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    z-index: 20;
    white-space: nowrap;
    min-width: 78px;
    text-align: center;
  }
  
  .click-tooltip::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 4px solid #1e293b;
  }

  .events-layer {
    position: absolute;
    top: 64px;
    left: 0;
    right: 0;
    height: 40px;
    z-index: 2;
  }

  .timeline-event {
    position: absolute;
    height: 32px;
    border-radius: 6px;
    border: 1px solid #8b5cf6; /* Violet 500 */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
    background: rgba(237, 233, 254, 0.9); /* Violet 100 high opacity */
    color: #5b21b6; /* Violet 800 */
    cursor: grab;
    transition: filter 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    overflow: hidden;
  }
  
  .timeline-event.dragging {
    cursor: grabbing;
    opacity: 0.9;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10;
  }

  .timeline-event.selected {
    border-width: 2px;
    border-color: #7c3aed; /* Violet 600 */
    background: white;
    box-shadow: 0 2px 4px rgba(124, 58, 237, 0.15);
    z-index: 5;
  }

  .timeline-event:hover {
    filter: brightness(0.98);
  }

  .event-label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  
  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: col-resize;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.1s;
    background: rgba(124, 58, 237, 0.1);
  }
  
  .resize-handle:hover {
    background: rgba(124, 58, 237, 0.3);
    opacity: 1;
  }
  
  .timeline-event.selected .resize-handle {
    opacity: 1; /* Always show handles when selected? Or maybe keep it on hover/proximity */
    background: transparent; /* Hidden but interactive unless hovered */
  }
  
  .timeline-event.selected .resize-handle:hover {
    background: rgba(124, 58, 237, 0.2);
  }
  
  .resize-handle.start {
    left: 0;
    border-left: 3px solid #7c3aed;
  }
  
  .resize-handle.end {
    right: 0;
    border-right: 3px solid #7c3aed;
  }

  .delete-event-btn {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ef4444;
    color: #ffffff;
    border: 2px solid white;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(0.8);
    transition: all 0.2s;
    z-index: 20;
  }
  
  .timeline-event:hover .delete-event-btn,
  .timeline-event.selected .delete-event-btn {
    opacity: 1;
    transform: scale(1);
    top: -6px;
    right: -6px;
  }
  
  .delete-event-btn:hover {
    background: #dc2626;
    transform: scale(1.1);
  }

  .current-time-indicator {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #f43f5e; /* Rose 500 */
    pointer-events: none;
    z-index: 4;
  }

  .current-time-indicator::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 9px;
    height: 9px;
    border-radius: 0 0 2px 2px;
    background: #f43f5e;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
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
