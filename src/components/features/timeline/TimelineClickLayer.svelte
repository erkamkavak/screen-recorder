<script lang="ts">
  import { getPositionPercent, formatTime, type SegmentBoundary } from "../../../lib/timeline/timelineUtils";
  import { timelineStore } from "../../../lib/stores/timeline";
  import type { PointerEventRecord } from "../../../lib/stores";

  export let duration: number;
  export let clickMarkers: { event: PointerEventRecord; seconds: number }[];
  export let segmentBoundaries: SegmentBoundary[];
  export let selectedClickIndex: number | null;
  export let onClickMarker: (index: number, marker: { event: PointerEventRecord; seconds: number }) => void;

  let hoveredClickEvent: PointerEventRecord | null = null;
</script>

<div class="click-lines-layer">
  {#each clickMarkers as marker, index}
    {@const seconds = marker.seconds}
    {@const clickZoomEvent = segmentBoundaries
      .flatMap((b) =>
        ($timelineStore.segmentEvents?.[b.id] ?? []).map((e) => ({ boundary: b, event: e }))
      )
      .find((item) => {
        if (item.event.type !== "zoom") return false;
        const start = item.boundary.originalStartSec + item.event.startTime;
        const end = start + item.event.duration;
        return seconds >= start && seconds <= end;
      })}
    <button
      type="button"
      class="click-line"
      class:has-zoom={Boolean(clickZoomEvent)}
      class:selected={selectedClickIndex === index}
      style={`left: ${getPositionPercent(seconds, duration)}%`}
      on:pointerenter={() => {
        hoveredClickEvent = marker.event;
      }}
      on:pointerleave={() => {
        hoveredClickEvent = null;
      }}
      on:click={(event) => {
        event.stopPropagation();
        onClickMarker(index, marker);
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

<style>
  .click-lines-layer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    pointer-events: none;
  }

  .click-line {
    position: absolute;
    top: 15px;
    bottom: 15px;
    width: 2px;
    background: #cbd5e1;
    border: none;
    padding: 0;
    cursor: pointer;
    pointer-events: auto;
    transition: all 0.1s ease;
  }

  .click-line:hover {
    background: #94a3b8;
    width: 3px;
    z-index: 10;
  }

  .click-line.has-zoom {
    background: #94a3b8;
  }

  .click-line.selected {
    background: #f97316;
    width: 3px;
    z-index: 11;
  }

  .click-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.65rem;
    margin-bottom: 4px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 20;
  }
</style>
