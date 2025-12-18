<script lang="ts">
  import { getPositionPercent, type SegmentBoundary } from "../../../lib/timeline/timelineUtils";
  import { timelineStore } from "../../../lib/stores/timeline";

  export let duration: number;
  export let timelineEvents: { segmentId: string; event: any }[];
  export let segmentBoundaries: SegmentBoundary[];
  export let dragState: any;
  export let getEventDisplay: (event: any) => any;
  export let onEventPointerDown: (event: PointerEvent, eventId: string, type: string) => void;
  export let onEventClick: (eventId: string, event: MouseEvent) => void;
  export let onEventKeydown: (eventId: string) => (event: KeyboardEvent) => void;
  export let onDeleteEvent: (eventId: string, event: MouseEvent) => void;
</script>

<div class="events-layer">
  {#each timelineEvents as item (item.event.id)}
    {@const boundary = segmentBoundaries.find((b) => b.id === item.segmentId)}
    {@const timelineEvent = getEventDisplay(item.event)}
    {@const globalStart = (boundary?.originalStartSec ?? 0) + timelineEvent.startTime}
    {@const globalEnd = (boundary?.originalStartSec ?? 0) + timelineEvent.startTime + timelineEvent.duration}
    {@const startPercent = getPositionPercent(globalStart, duration)}
    {@const widthPercent = Math.max(
      0.75,
      getPositionPercent(globalEnd, duration) - startPercent
    )}
    {@const isSelected = $timelineStore.selectedEvent?.eventId === timelineEvent.id}
    
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      role="button"
      tabindex="0"
      class="timeline-event zoom"
      class:selected={isSelected}
      class:dragging={dragState?.id === timelineEvent.id}
      style={`left: ${startPercent}%; width: ${widthPercent}%`}
      on:pointerdown={(e) => onEventPointerDown(e, timelineEvent.id, 'event-move')}
      on:click={(event) => onEventClick(timelineEvent.id, event)}
      on:keydown={onEventKeydown(timelineEvent.id)}
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
           on:pointerdown={(e) => onEventPointerDown(e, timelineEvent.id, 'event-resize-start')}
           on:click|stopPropagation
           title="Drag to change start time"
         ></div>
         <div 
           class="resize-handle end"
           on:pointerdown={(e) => onEventPointerDown(e, timelineEvent.id, 'event-resize-end')}
           on:click|stopPropagation
           title="Drag to change duration"
         ></div>

        <button
          class="delete-event-btn"
          on:click={(event) => onDeleteEvent(timelineEvent.id, event)}
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

<style>
  .events-layer {
    position: absolute;
    top: 30px;
    left: 0;
    right: 0;
    height: 40px;
    z-index: 10;
    pointer-events: none;
  }

  .timeline-event {
    position: absolute;
    top: 4px; /* Added some margin */
    bottom: 4px;
    background: #1e293b; /* Slate-800 for non-selected */
    color: white;
    border-radius: 8px; /* Slightly more rounded */
    cursor: move;
    pointer-events: auto;
    display: flex;
    align-items: center;
    padding: 0 0.6rem;
    min-width: 24px;
    font-size: 0.75rem;
    font-weight: 500;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 5;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .timeline-event:hover {
    background: #334155;
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }

  .timeline-event.selected {
    background: #1E2852; /* Brand Navy */
    z-index: 10;
    box-shadow: 0 0 0 3px rgba(30, 40, 82, 0.3), 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    border-color: #364c99;
  }

  .timeline-event.dragging {
    opacity: 0.9;
    cursor: grabbing;
    z-index: 20;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    transform: scale(1.02);
  }

  .event-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
    overflow: hidden;
    user-select: none;
  }

  .label-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-event-btn {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 16px;
    height: 16px;
    border-radius: 9999px;
    background: #ef4444;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    line-height: 1;
    border: 1px solid white;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    cursor: pointer;
    z-index: 10;
    padding: 0;
  }
  
  .delete-event-btn:hover {
    background: #dc2626;
    transform: scale(1.1);
  }

  /* Resize Handles */
  .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 5;
  }

  .resize-handle:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .resize-handle.start { left: 0; border-right: 1px solid rgba(255, 255, 255, 0.1); }
  .resize-handle.end { right: 0; border-left: 1px solid rgba(255, 255, 255, 0.1); }
</style>
