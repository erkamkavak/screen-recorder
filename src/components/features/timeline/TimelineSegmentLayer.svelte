<script lang="ts">
  import { getPositionPercent, formatTime, type SegmentBoundary } from "../../../lib/timeline/timelineUtils";

  export let duration: number;
  export let segmentBoundaries: SegmentBoundary[];
  export let optimisticSegmentTrim: { id: string; trimStartSec: number; trimEndSec: number } | null;
  export let onTrimPointerDown: (event: PointerEvent, id: string, edge: "start" | "end") => void;

  const getSegmentTrimDisplay = (boundary: SegmentBoundary) => {
    if (optimisticSegmentTrim && optimisticSegmentTrim.id === boundary.id) {
      return {
        trimStartSec: optimisticSegmentTrim.trimStartSec,
        trimEndSec: optimisticSegmentTrim.trimEndSec,
      };
    }
    return {
      trimStartSec: boundary.trimStartSec,
      trimEndSec: boundary.trimEndSec,
    };
  };
</script>

<div class="segment-trims-layer">
  {#each segmentBoundaries as boundary, i}
    {@const trimDisplay = getSegmentTrimDisplay(boundary)}
    {@const segWidthPercent = duration > 0 ? (Math.max(0.01, boundary.originalDurationSec) / duration) * 100 : 0}
    {@const segLeftPercent = getPositionPercent(boundary.originalStartSec, duration)}
    {@const keptLeftSec = boundary.originalStartSec + trimDisplay.trimStartSec}
    {@const keptRightSec = boundary.originalEndSec - trimDisplay.trimEndSec}
    {@const keptLeftPercent = getPositionPercent(keptLeftSec, duration)}
    {@const keptRightPercent = getPositionPercent(keptRightSec, duration)}
    {@const keptWidthPercent = Math.max(0, keptRightPercent - keptLeftPercent)}
    {@const hasTrim = trimDisplay.trimStartSec > 0.01 || trimDisplay.trimEndSec > 0.01}
    
    <!-- Segment region background -->
    <div
      class="segment-region"
      class:has-trim={hasTrim}
      style={`left: ${segLeftPercent}%; width: ${segWidthPercent}%`}
      title={`Segment ${i + 1}: ${formatTime(boundary.originalDurationSec)}`}
    >
      <span class="segment-region-label">S{i + 1}</span>
    </div>

    <!-- Kept range (between trims) -->
    <div
      class="segment-kept"
      style={`left: ${keptLeftPercent}%; width: ${keptWidthPercent}%`}
      title={`Kept: ${formatTime(Math.max(0, boundary.originalDurationSec - trimDisplay.trimStartSec - trimDisplay.trimEndSec))}`}
    ></div>

    <!-- Segment trim handles -->
    <button
      type="button"
      class="segment-trim-handle start"
      style={`left: ${keptLeftPercent}%`}
      on:pointerdown={(e) => onTrimPointerDown(e, boundary.id, "start")}
      title={`Trim start of segment ${i + 1} (${formatTime(trimDisplay.trimStartSec)} trimmed)`}
    ></button>
    <button
      type="button"
      class="segment-trim-handle end"
      style={`left: ${keptRightPercent}%`}
      on:pointerdown={(e) => onTrimPointerDown(e, boundary.id, "end")}
      title={`Trim end of segment ${i + 1} (${formatTime(trimDisplay.trimEndSec)} trimmed)`}
    ></button>

    <!-- Segment boundary marker (between segments) -->
    {#if i > 0}
      <div
        class="segment-boundary"
        style={`left: ${segLeftPercent}%`}
        title={`Segment ${i + 1} starts at ${formatTime(boundary.originalStartSec)}`}
      >
      </div>
    {/if}
  {/each}
</div>

<style>
  .segment-trims-layer {
    position: absolute;
    top: 30px;
    left: 0;
    right: 0;
    height: 40px;
  }

  .segment-region {
    position: absolute;
    top: 0;
    bottom: 0;
    background: #f1f5f9;
    border-radius: 4px;
    opacity: 0.5;
    border: 1px dashed #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .segment-region.has-trim {
    background: #e2e8f0;
  }
  
  .segment-region-label {
    font-size: 0.65rem;
    font-weight: 700;
    color: #94a3b8;
    background: white;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #e2e8f0;
  }

  .segment-kept {
    position: absolute;
    top: 0;
    bottom: 0;
    background: white;
    border: 1.5px solid #64748b;
    border-radius: 6px;
    z-index: 1;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  .segment-trim-handle {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 8px;
    background: #64748b;
    border: none;
    border-radius: 4px;
    cursor: ew-resize;
    z-index: 3;
    transition: all 0.15s ease;
    padding: 0;
  }
  
  .segment-trim-handle:hover {
    background: #f97316;
    width: 10px;
    transform: translateX(-1px);
  }
  
  .segment-trim-handle.start { transform: translateX(-50%); }
  .segment-trim-handle.end { transform: translateX(-50%); }

  .segment-boundary {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #cbd5e1;
    z-index: 2;
  }
</style>
