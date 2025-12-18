<script lang="ts">
  import { timelineStore } from "../lib/stores/timeline";
  import type { PointerEventRecord, RecordingSegment } from "../lib/stores";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../lib/timeline/zoomDefaults";
  import { 
    clampTime, 
    formatTime, 
    calculateSegmentBoundaries, 
    effectiveToDisplayTime,
    focusForTime
  } from "../lib/timeline/timelineUtils";

  import TimelineToolbar from "./features/timeline/TimelineToolbar.svelte";
  import TimelineMarkers from "./features/timeline/TimelineMarkers.svelte";
  import TimelineSegmentLayer from "./features/timeline/TimelineSegmentLayer.svelte";
  import TimelineEventsLayer from "./features/timeline/TimelineEventsLayer.svelte";
  import TimelineClickLayer from "./features/timeline/TimelineClickLayer.svelte";
  import TimelineCurrentTimeIndicator from "./features/timeline/TimelineCurrentTimeIndicator.svelte";
  import { sortedClickEventsStore } from "../lib/stores/reviewSession";

  export let duration = 0;
  export let currentTime = 0;
  export let onAddZoomForClick: ((clickEvent: PointerEventRecord, seconds?: number) => void) | null = null;
  export let segments: RecordingSegment[] = [];
  export let onSegmentTrimChange: ((segmentId: string, edge: "start" | "end", valueMs: number) => void) | null = null;

  let zoomDraft = false;
  let trackEl: HTMLDivElement | null = null;
  
  // Drag state
  interface DragState {
    type: "event-move" | "event-resize-start" | "event-resize-end" | "segment-trim";
    id?: string;
    segmentId?: string;
    edge?: "start" | "end";
    startX: number;
    initialTime: number;
    initialDuration?: number;
  }

  let dragState: DragState | null = null;
  let suppressedClickEventId: string | null = null;
  let eventDragOccurred = false;
  
  let optimisticEvent: { id: string; startTime: number; duration: number } | null = null;
  let selectedClickIndex: number | null = null;

  // Reactive state
  $: timeMarkers = duration > 0 ? Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, index) => index * 5) : [];
  
  $: segmentBoundaries = calculateSegmentBoundaries(segments);
  
  $: clickMarkers = segmentBoundaries.length > 0
    ? segmentBoundaries.flatMap((b) => {
        const seg = segments.find((s) => s.id === b.id);
        if (!seg) return [];
        return seg.events
          .filter((e) => e.kind === "click")
          .map((event) => ({
            event: event as PointerEventRecord,
            seconds: b.originalStartSec + event.t / 1000,
          }));
      })
    : $sortedClickEventsStore.map((event) => ({
        event,
        seconds: clampTime(event.t / 1000, duration),
      }));

  $: timelineEvents = segmentBoundaries.flatMap((b) =>
    ($timelineStore.segmentEvents?.[b.id] ?? []).map((event) => ({ segmentId: b.id, event }))
  );

  let optimisticSegmentTrim: { id: string; trimStartSec: number; trimEndSec: number } | null = null;

  // Handlers
  const handleTrackClick = (e: MouseEvent) => {
    if (!trackEl || !zoomDraft) return;
    const rect = trackEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const seconds = (x / rect.width) * duration;
    
    const focus = focusForTime(seconds, duration, $sortedClickEventsStore);
    
    const targetSegment = segmentBoundaries.find(b => seconds >= b.originalStartSec && seconds <= b.originalEndSec);
    if (!targetSegment) return;

    const segmentLocalStart = Math.max(0, seconds - targetSegment.originalStartSec);

    timelineStore.addZoom(targetSegment.id, {
        startTime: segmentLocalStart,
        duration: ZOOM_DEFAULT_DURATION,
        zoom: ZOOM_DEFAULT_SCALE,
        focusX: focus.x,
        focusY: focus.y,
        easing: 'ease-in-out',
        label: 'Zoom'
    });
    zoomDraft = false;
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!dragState || !trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const deltaX = currentX - dragState.startX;
    const deltaTime = (deltaX / rect.width) * duration;

    if (Math.abs(deltaX) > 2) {
      eventDragOccurred = true;
    }

    if (dragState.type === 'segment-trim') {
        const b = segmentBoundaries.find(b => b.id === dragState.id);
        if (!b) return;
        
        let newTrimStart = b.trimStartSec;
        let newTrimEnd = b.trimEndSec;
        
        if (dragState.edge === 'start') {
            newTrimStart = Math.max(0, Math.min(b.originalDurationSec - b.trimEndSec - 0.1, dragState.initialTime + deltaTime));
        } else {
            newTrimEnd = Math.max(0, Math.min(b.originalDurationSec - b.trimStartSec - 0.1, dragState.initialTime - deltaTime));
        }
        
        optimisticSegmentTrim = { id: b.id, trimStartSec: newTrimStart, trimEndSec: newTrimEnd };
        return;
    }

    if (dragState.id) {
       const newTime = Math.max(0, dragState.initialTime + deltaTime);
       if (dragState.type === 'event-move') {
           optimisticEvent = { id: dragState.id, startTime: newTime, duration: dragState.initialDuration! };
       } else if (dragState.type === 'event-resize-end') {
           optimisticEvent = { id: dragState.id, startTime: dragState.initialTime, duration: Math.max(0.1, dragState.initialDuration! + deltaTime) };
       } else if (dragState.type === 'event-resize-start') {
           const clampedStart = Math.max(0, newTime);
           const actualDelta = clampedStart - dragState.initialTime;
           optimisticEvent = { id: dragState.id, startTime: clampedStart, duration: Math.max(0.1, dragState.initialDuration! - actualDelta) };
       }
    }
  };

  const stopDragging = () => {
    if (dragState?.type === 'segment-trim' && optimisticSegmentTrim && onSegmentTrimChange) {
        const edge = dragState.edge!;
        const val = edge === 'start' ? optimisticSegmentTrim.trimStartSec : optimisticSegmentTrim.trimEndSec;
        onSegmentTrimChange(dragState.id!, edge, val * 1000);
    } else if (dragState && optimisticEvent) {
       timelineStore.updateZoom(dragState.segmentId!, optimisticEvent.id, {
           startTime: optimisticEvent.startTime,
           duration: optimisticEvent.duration
       });
    }
    dragState = null;
    optimisticEvent = null;
    optimisticSegmentTrim = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDragging);
  };

  const handleEventPointerDown = (e: PointerEvent, eventId: string, type: DragState["type"]) => {
    e.stopPropagation();
    if (!trackEl) return;
    const segmentId = segmentBoundaries.find((b) => ($timelineStore.segmentEvents?.[b.id] ?? []).some((e) => e.id === eventId))?.id;
    if (!segmentId) return;
    const targetEvent = ($timelineStore.segmentEvents?.[segmentId] ?? []).find((e) => e.id === eventId);
    if (!targetEvent) return;

    const rect = trackEl.getBoundingClientRect();
    dragState = {
        type,
        id: eventId,
        segmentId,
        startX: e.clientX - rect.left,
        initialTime: targetEvent.startTime,
        initialDuration: targetEvent.duration
    };
    eventDragOccurred = false;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
  };

  const handleTrimPointerDown = (e: PointerEvent, id: string, edge: "start" | "end") => {
      e.stopPropagation();
      if (!trackEl) return;
      const b = segmentBoundaries.find(b => b.id === id);
      if (!b) return;
      
      const rect = trackEl.getBoundingClientRect();
      dragState = {
          type: 'segment-trim',
          id,
          edge,
          startX: e.clientX - rect.left,
          initialTime: edge === 'start' ? b.trimStartSec : b.trimEndSec
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopDragging);
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
        const segmentId = segmentBoundaries.find((b) => ($timelineStore.segmentEvents?.[b.id] ?? []).some((e) => e.id === eventId))?.id;
        if (!segmentId) return;
        const isSelected = $timelineStore.selectedEvent?.segmentId === segmentId && $timelineStore.selectedEvent?.eventId === eventId;
        timelineStore.selectEvent(isSelected ? null : { segmentId, eventId });
    }
  };

  const handleEventKeydown = (eventId: string) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const segmentId = segmentBoundaries.find((b) => ($timelineStore.segmentEvents?.[b.id] ?? []).some((e) => e.id === eventId))?.id;
      if (!segmentId) return;
      const isSelected = $timelineStore.selectedEvent?.segmentId === segmentId && $timelineStore.selectedEvent?.eventId === eventId;
      timelineStore.selectEvent(isSelected ? null : { segmentId, eventId });
    }
  };

  const deleteTimelineEvent = (eventId: string, event: MouseEvent) => {
    event.stopPropagation();
    const segmentId = segmentBoundaries.find((b) => ($timelineStore.segmentEvents?.[b.id] ?? []).some((e) => e.id === eventId))?.id;
    if (!segmentId) return;
    timelineStore.deleteEvent(segmentId, eventId);
  };

  const handleReset = () => {
      if (confirm("Reset all zoom events and trims? This cannot be undone.")) {
          timelineStore.reset();
          if (segments && onSegmentTrimChange) {
              for (const seg of segments) {
                  onSegmentTrimChange(seg.id, "start", 0);
                  onSegmentTrimChange(seg.id, "end", 0);
              }
          }
      }
  };

  function getEventDisplay(event: any) {
    if (optimisticEvent && optimisticEvent.id === event.id) {
      return { ...event, ...optimisticEvent };
    }
    return event;
  }

  const handleMarkerClick = (index: number, marker: { event: PointerEventRecord; seconds: number }) => {
      const clickZoomEvent = segmentBoundaries
          .flatMap((b) => ($timelineStore.segmentEvents?.[b.id] ?? []).map((e) => ({ boundary: b, event: e })))
          .find((item) => {
              if (item.event.type !== "zoom") return false;
              const start = item.boundary.originalStartSec + item.event.startTime;
              const end = start + item.event.duration;
              return marker.seconds >= start && marker.seconds <= end;
          });

      if (clickZoomEvent) {
          timelineStore.selectEvent({ 
              segmentId: clickZoomEvent.boundary.id, 
              eventId: clickZoomEvent.event.id 
          });
          selectedClickIndex = index;
      } else if (onAddZoomForClick) {
          onAddZoomForClick(marker.event, marker.seconds);
          selectedClickIndex = index;
      }
  };
</script>

<div class="timeline-container">
  <TimelineToolbar 
    bind:zoomDraft 
    onToggleZoomDraft={() => zoomDraft = !zoomDraft}
    onDeleteSelected={() => {
        if ($timelineStore.selectedEvent) {
            timelineStore.deleteEvent($timelineStore.selectedEvent.segmentId, $timelineStore.selectedEvent.eventId);
        }
    }}
    onReset={handleReset}
  />

  <div 
    class="timeline-track-outer"
    on:click={handleTrackClick}
    bind:this={trackEl}
  >
    <TimelineMarkers {duration} {timeMarkers} />
    
    <div class="timeline-track-inner">
      <TimelineSegmentLayer 
        {duration} 
        {segmentBoundaries} 
        {optimisticSegmentTrim} 
        onTrimPointerDown={handleTrimPointerDown}
      />
      
      <TimelineEventsLayer 
        {duration}
        {timelineEvents}
        {segmentBoundaries}
        {dragState}
        {getEventDisplay}
        onEventPointerDown={handleEventPointerDown}
        onEventClick={handleEventClick}
        onEventKeydown={handleEventKeydown}
        onDeleteEvent={deleteTimelineEvent}
      />

      <TimelineClickLayer 
        {duration}
        {clickMarkers}
        {segmentBoundaries}
        {selectedClickIndex}
        onClickMarker={handleMarkerClick}
      />

      <TimelineCurrentTimeIndicator 
        {duration} 
        position={effectiveToDisplayTime(currentTime, duration, segmentBoundaries)} 
      />
    </div>
  </div>

  <div class="timeline-footer">
    <div class="time-display current">{formatTime(currentTime)}</div>
    <div class="time-total">/ {formatTime(duration)}</div>
  </div>
</div>

<style>
  .timeline-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    margin-top: 1rem;
  }

  .timeline-track-outer {
    position: relative;
    height: 100px;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    cursor: crosshair;
    overflow: visible;
  }

  .timeline-track-inner {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .timeline-footer {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    justify-content: flex-end;
  }

  .time-display.current {
    font-size: 1.1rem;
    font-weight: 700;
    color: #0f172a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .time-total {
    font-size: 0.85rem;
    color: #64748b;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
</style>
