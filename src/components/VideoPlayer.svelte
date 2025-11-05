<script lang="ts">
  import { onDestroy } from "svelte";
  import type { InputEventRecord, PointerEventRecord } from "../stores";
  import { timelineStore } from "../stores/timeline";
  import { computeZoomState } from "../utils/timelinePlayback";

  export let src: string;
  export let events: InputEventRecord[] = [];
  export let duration: number = 0;
  export let currentTime: number = 0;

  let videoEl: HTMLVideoElement;
  let isPlaying = false;
  let isReady = false;
  let rafId: number;

  const formatTime = (value: number) => {
    if (!isFinite(value) || value < 0) return "00:00";
    const wholeSeconds = Math.floor(value);
    const minutes = Math.floor(wholeSeconds / 60);
    const seconds = wholeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const clampToDuration = (value: number) => {
    if (!isFinite(duration) || duration <= 0) return 0;
    return Math.max(0, Math.min(duration, value));
  };

  let trimStart = 0;
  let trimEnd = 0;

  $: {
    const startValue = clampToDuration($timelineStore.trimStart ?? 0);
    const fallbackEnd = duration > 0 ? duration : startValue;
    const storeTrimEnd = $timelineStore.trimEnd;
    const endValue = clampToDuration(storeTrimEnd ?? fallbackEnd);
    trimStart = Math.min(startValue, endValue);
    trimEnd = Math.max(endValue, trimStart);
  }

  const ensureWithinTrim = () => {
    if (!videoEl || !isReady) return;
    if (videoEl.currentTime < trimStart) {
      videoEl.currentTime = trimStart;
      currentTime = trimStart;
    }
    if (videoEl.currentTime > trimEnd) {
      videoEl.currentTime = trimEnd;
      currentTime = trimEnd;
      if (!videoEl.paused) {
        videoEl.pause();
        isPlaying = false;
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoEl) return;
    duration = videoEl.duration || 0;
    currentTime = videoEl.currentTime || 0;
    isReady = true;
    ensureWithinTrim();
  };

  const handleTimeUpdate = () => {
    if (!videoEl) return;
    currentTime = videoEl.currentTime;
    if (currentTime > trimEnd) {
      videoEl.pause();
      isPlaying = false;
      currentTime = trimEnd;
      videoEl.currentTime = trimEnd;
    }
  };

  const handlePlay = () => {
    ensureWithinTrim();
    isPlaying = true;
    syncWhilePlaying();
  };

  const handlePause = () => {
    isPlaying = false;
    cancelAnimationFrame(rafId);
  };

  const handleEnded = () => {
    isPlaying = false;
    cancelAnimationFrame(rafId);
    currentTime = duration;
  };

  const togglePlay = async () => {
    if (!videoEl) return;
    try {
      if (videoEl.paused || videoEl.ended) {
        await videoEl.play();
      } else {
        videoEl.pause();
      }
    } catch (err) {
      console.warn("Unable to toggle playback", err);
    }
  };

  const handleSeek = (event: Event) => {
    if (!videoEl) return;
    const target = event.target as HTMLInputElement;
    const value = Number(target.value);
    if (Number.isFinite(value)) {
      const clamped = Math.max(trimStart, Math.min(trimEnd, value));
      videoEl.currentTime = clamped;
      currentTime = clamped;
    }
  };

  const syncWhilePlaying = () => {
    cancelAnimationFrame(rafId);
    const update = () => {
      if (!videoEl) return;
      currentTime = videoEl.currentTime;
      if (!videoEl.paused && !videoEl.ended) {
        rafId = requestAnimationFrame(update);
      }
    };
    rafId = requestAnimationFrame(update);
  };

  onDestroy(() => {
    cancelAnimationFrame(rafId);
  });

  const pointerEvents = () =>
    (events.filter((event) => event.kind === "click") as PointerEventRecord[]);

  $: markerPositions = isReady && duration > 0
    ? pointerEvents().map((event) => {
        const seconds = Math.min(duration, Math.max(0, event.t / 1000));
        return (seconds / duration) * 100;
      })
    : [];

  $: effectiveRange = Math.max(trimEnd - trimStart, 0);
  $: progressPercent = (() => {
    if (effectiveRange <= 0) return 0;
    const normalized = ((currentTime - trimStart) / effectiveRange) * 100;
    return Math.max(0, Math.min(100, normalized));
  })();

  $: zoomState = computeZoomState($timelineStore.events, currentTime);
  $: zoomScale = zoomState.scale;
  $: zoomOrigin = `${Math.round(zoomState.focusX * 100)}% ${Math.round(zoomState.focusY * 100)}%`;

  $: ensureWithinTrim();
</script>

<div class="player-shell">
  <div class="video-frame">
    <video
      bind:this={videoEl}
      src={src}
      playsinline
      on:loadedmetadata={handleLoadedMetadata}
      on:timeupdate={handleTimeUpdate}
      on:play={handlePlay}
      on:pause={handlePause}
      on:ended={handleEnded}
      on:click={togglePlay}
      class="video-element"
      controls={false}
      style={`transform-origin: ${zoomOrigin}; transform: scale(${zoomScale});`}
    />

  </div>

  <div class="controls">
    <div class="controls-row">
      <button class="control-button" on:click={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
        {#if isPlaying}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        {/if}
      </button>
      <div class="time-display">{formatTime(currentTime)} / {formatTime(trimEnd)}</div>
    </div>

    <div class="timeline">
      <div class="marker-layer">
        {#if markerPositions.length && duration > 0}
          {#each markerPositions as marker, index}
            <span
              class="timeline-marker"
              style={`left: calc(${marker}% - 2px);`}
              aria-hidden="true"
            />
          {/each}
        {/if}
      </div>
      <input
        class="timeline-range"
        type="range"
        min={trimStart}
        max={trimEnd}
        step="0.01"
        value={currentTime}
        style={`--progress:${progressPercent}%`}
        on:input={handleSeek}
        disabled={trimEnd <= trimStart}
      />
    </div>
  </div>
</div>

<style>
  .player-shell {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .video-frame {
    position: relative;
    width: 100%;
    background: #0f172a;
    aspect-ratio: 16/9;
    display: flex;
    overflow: hidden;
  }

  .video-element {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: pointer;
    transition: transform 0.18s ease, transform-origin 0.18s ease;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .control-button {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 9999px;
    border: none;
    background: #111827;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .control-button:hover {
    background: #1f2937;
  }

  .control-button svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: currentColor;
  }

  .time-display {
    font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.85rem;
    color: #475569;
  }

  .timeline {
    position: relative;
  }

  .timeline-range {
    width: 100%;
    appearance: none;
    background: #e5e7eb;
    height: 0.35rem;
    border-radius: 9999px;
    outline: none;
    cursor: pointer;
  }

  .timeline-range::-webkit-slider-thumb {
    appearance: none;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 9999px;
    background: white;
    border: 2px solid #111827;
  }

  .timeline-range::-moz-range-thumb {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 9999px;
    background: white;
    border: 2px solid #111827;
  }

  .timeline-range::-webkit-slider-runnable-track {
    height: 0.35rem;
    border-radius: 9999px;
  }

  .timeline-range::-moz-range-track {
    height: 0.35rem;
    border-radius: 9999px;
  }

  .marker-layer {
    pointer-events: none;
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
  }

  .timeline-marker {
    position: absolute;
    width: 3px;
    height: 10px;
    border-radius: 9999px;
    background: #fb923c;
  }

  @media (max-width: 640px) {
    .video-frame {
      aspect-ratio: auto;
    }

    .video-element {
      aspect-ratio: 4/3;
    }
  }
</style>
