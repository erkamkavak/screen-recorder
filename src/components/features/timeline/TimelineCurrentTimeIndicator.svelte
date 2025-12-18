<script lang="ts">
  import { getPositionPercent } from "../../../lib/timeline/timelineUtils";

  export let duration: number;
  export let position: number;
</script>

<div class="current-time-indicator" style={`left: ${getPositionPercent(position, duration)}%`}></div>

<style>
  .current-time-indicator {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #F04D21; /* Brand Red */
    z-index: 50;
    pointer-events: none;
    box-shadow: 0 0 10px rgba(240, 77, 33, 0.5);
  }

  .current-time-indicator::after {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
    width: 12px;
    height: 12px;
    background: #F04D21;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
</style>
