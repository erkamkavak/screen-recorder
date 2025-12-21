<script lang="ts">
  export let isRecording: boolean = false;
  export let onExit: () => void = () => {};
</script>

<div class="zoom-overlay">
  <div class="zoom-overlay-title">
    <div class="badge-dot"></div>
    <div>
      <strong>Zoom editor</strong>
      <span>Keyboard-driven zooming while you preview.</span>
    </div>
  </div>
  <div class="shortcut-stack">
    {#if isRecording}
      <span class="shortcut-pill is-live">
        <span class="live-dot"></span>
        Recording zoom
      </span>
    {/if}
    <span class="shortcut-pill"><strong>Space</strong> Play/Pause</span>
    <span class="shortcut-pill"><strong>←/→</strong> -5/+5s</span>
    <span class="shortcut-pill"><strong>Shift + ←/→</strong> -1/+1s</span>
    <span class="shortcut-pill"><strong>Z</strong> Add zoom</span>
    <span class="shortcut-pill"><strong>Esc</strong> Exit</span>
  </div>
  <button class="secondary" on:click={onExit}>Exit zoom editor</button>
</div>

<style>
  .zoom-overlay {
    position: absolute;
    left: 1rem;
    right: 1rem;
    top: 1rem;
    z-index: 2;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 0.9rem;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #e2e8f0;
    backdrop-filter: blur(6px);
  }

  .zoom-overlay-title {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .zoom-overlay-title strong {
    display: block;
    font-size: 0.95rem;
    color: #f8fafc;
  }

  .zoom-overlay-title span {
    display: block;
    font-size: 0.78rem;
    color: #cbd5f5;
  }

  .badge-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, #fbbf24, #f97316);
    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.2);
  }

  .shortcut-stack {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .shortcut-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgba(226, 232, 240, 0.15);
    color: #f8fafc;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .shortcut-pill strong {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .shortcut-pill.is-live {
    background: rgba(248, 113, 113, 0.2);
    color: #fee2e2;
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #ef4444;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25);
  }

  @media (max-width: 640px) {
    .zoom-overlay {
      grid-template-columns: 1fr;
      align-items: flex-start;
    }
  }
</style>
