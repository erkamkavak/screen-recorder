<script lang="ts">
  import { getPositionPercent, formatTime } from "../../../lib/timeline/timelineUtils";

  export let duration: number;
  export let timeMarkers: number[];
</script>

<div class="time-markers">
  {#each timeMarkers as marker}
    <div class="time-marker" style={`left: ${getPositionPercent(marker, duration)}%`}>
      <span class="marker-tick"></span>
      <span class="marker-label">{formatTime(marker)}</span>
    </div>
  {/each}
</div>

<style>
  .time-markers {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .time-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
  }

  .marker-tick {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 8px;
    background: #cbd5e1;
  }

  .marker-label {
    position: absolute;
    top: 12px;
    left: 4px;
    font-size: 0.65rem;
    color: #64748b;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
</style>
