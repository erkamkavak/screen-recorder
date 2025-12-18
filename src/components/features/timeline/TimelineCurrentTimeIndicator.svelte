<script lang="ts">
  import { getPositionPercent } from "../../../lib/timeline/timelineUtils";

  export let duration: number;
  export let position: number;
</script>

<div class="current-time-indicator" style={`left: ${getPositionPercent(position, duration)}%`}></div>

<style>
  .current-time-indicator {
    position: absolute;
    top: 10px;
    bottom: 10px;
    width: 2px;
    background: #f97316;
    z-index: 50;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(249, 115, 22, 0.4);
  }

  .current-time-indicator::after {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
    width: 10px;
    height: 10px;
    background: #f97316;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
</style>
