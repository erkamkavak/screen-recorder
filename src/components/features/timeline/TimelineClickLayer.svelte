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
    top: 10px;
    bottom: 10px;
    width: 2px;
    background: #cbd5e1;
    border: none;
    padding: 0;
    cursor: pointer;
    pointer-events: auto;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .click-line:hover {
    background: #94a3b8;
    width: 4px;
    z-index: 10;
  }

  .click-line.has-zoom {
    background: #94a3b8;
    opacity: 0.7;
  }

  .click-line.selected {
    background: #F04D21; /* Brand Red */
    width: 4px;
    z-index: 11;
    box-shadow: 0 0 8px rgba(240, 77, 33, 0.4);
  }

  .click-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    background: #1e293b;
    color: white;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-bottom: 8px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 50;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    animation: tooltip-in 0.2s ease-out;
  }

  @keyframes tooltip-in {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
