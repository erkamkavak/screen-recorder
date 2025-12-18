<script lang="ts">
  import { formatTime } from "../../lib/timeline/timelineUtils";

  export let playing: boolean;
  export let currentTime: number;
  export let duration: number;
  export let onPlay: () => void;
  export let onPause: () => void;
  export let onSeek: (val: number) => void;

  const handleSeek = (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    onSeek(parseFloat(target.value));
  };
</script>

<div class="player-controls">
  <div class="controls-left">
    <button class="play-btn" on:click={playing ? onPause : onPlay}>
      {#if playing}
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      {/if}
    </button>
  </div>

  <div class="controls-center">
    <input
      type="range"
      min="0"
      max={duration || 0}
      step="0.001"
      value={currentTime}
      on:input={handleSeek}
      class="progress-slider"
    />
  </div>

  <div class="controls-right">
    <span class="time-readout">{formatTime(currentTime)} / {formatTime(duration)}</span>
  </div>
</div>

<style>
  .player-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    background: #0f172a;
    color: white;
    border-radius: 0 0 16px 16px;
  }

  .play-btn {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: transform 0.1s ease;
  }

  .play-btn:hover {
    transform: scale(1.1);
  }

  .controls-center {
    flex: 1;
  }

  .progress-slider {
    width: 100%;
    accent-color: #f97316;
    cursor: pointer;
  }

  .time-readout {
    font-size: 0.85rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: #94a3b8;
  }
</style>
