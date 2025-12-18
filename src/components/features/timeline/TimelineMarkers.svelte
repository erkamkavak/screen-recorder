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
    height: 10px;
    background: #e2e8f0;
  }

  .marker-label {
    position: absolute;
    top: 14px;
    left: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #94a3b8;
    white-space: nowrap;
    font-family: 'Outfit', ui-sans-serif, system-ui;
    font-variant-numeric: tabular-nums;
  }
</style>
