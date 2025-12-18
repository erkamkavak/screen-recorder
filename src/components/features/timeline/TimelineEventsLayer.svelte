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
    top: 0;
    bottom: 0;
    background: #0f172a;
    color: white;
    border-radius: 6px;
    cursor: move;
    pointer-events: auto;
    display: flex;
    align-items: center;
    padding: 0 0.4rem;
    min-width: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    border: 1px solid rgba(255,255,255,0.1);
    z-index: 5;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
  }

  .timeline-event:hover {
    background: #1e293b;
    border-color: rgba(255,255,255,0.2);
  }

  .timeline-event.selected {
    background: #4f46e5;
    z-index: 10;
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.4);
    border-color: #818cf8;
  }

  .timeline-event.dragging {
    opacity: 0.8;
    cursor: grabbing;
    z-index: 20;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  .event-label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
    overflow: hidden;
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
