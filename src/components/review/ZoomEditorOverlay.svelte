<script lang="ts">
  import { fade, scale } from "svelte/transition";
  export let isRecording: boolean = false;
  export let onExit: () => void = () => {};
</script>

<div
  class="zoom-editor-overlay"
  transition:fade={{ duration: 200 }}
>
  <div class="editor-info">
    <div class="editor-dot-w">
      <div class="editor-dot" />
    </div>
    <div class="editor-text">
      <h3 class="editor-title">Zoom Editor</h3>
      <p class="editor-subtitle">Keyboard shortcuts active</p>
    </div>
  </div>

  <div class="controls-w">
    {#if isRecording}
      <div class="recording-indicator" transition:scale>
        <span class="rec-dot" />
        Recording
      </div>
    {/if}

    <div class="shortcuts-grid">
      <div class="shortcut">
        <kbd>SPACE</kbd>
        <span>Play</span>
      </div>
      <div class="shortcut">
        <kbd>← / →</kbd>
        <span>Seek</span>
      </div>
      <div class="shortcut">
        <kbd>Z</kbd>
        <span>Zoom</span>
      </div>
      <div class="shortcut">
        <kbd>ESC</kbd>
        <span>Exit</span>
      </div>
    </div>
  </div>

  <button class="done-btn" on:click={onExit}>
    Done
  </button>
</div>

<style>
  .zoom-editor-overlay {
    position: absolute;
    top: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0.625rem 1rem;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
    min-width: max-content;
  }

  .editor-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .editor-dot-w {
    display: flex;
    height: 2rem;
    width: 2rem;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.1);
  }

  .editor-dot {
    height: 0.5rem;
    width: 0.5rem;
    border-radius: 50%;
    background: white;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  }

  .editor-text {
    display: flex;
    flex-direction: column;
  }

  .editor-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.95);
  }

  .editor-subtitle {
    margin: 0;
    font-size: 0.625rem;
    font-weight: 500;
    color: #94a3b8;
  }

  .controls-w {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .recording-indicator {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background: rgba(244, 63, 94, 0.1);
    border: 1px solid rgba(244, 63, 94, 0.2);
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fb7185;
  }

  .rec-dot {
    height: 0.375rem;
    width: 0.375rem;
    border-radius: 50%;
    background: #f43f5e;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .5; }
  }

  .shortcuts-grid {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #cbd5e1;
    font-size: 0.6875rem;
    font-weight: 700;
  }

  .shortcut kbd {
    display: flex;
    min-width: 1.75rem;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.375rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.5rem;
    color: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .shortcut span {
    text-transform: uppercase;
    letter-spacing: 0.025em;
    opacity: 0.6;
  }

  .done-btn {
    height: 2rem;
    padding: 0 1rem;
    background: white;
    color: black;
    border: none;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .done-btn:hover {
    background: #f1f5f9;
    transform: translateY(-1px);
  }

  .done-btn:active {
    transform: translateY(0) scale(0.95);
  }

  @media (max-width: 640px) {
    .zoom-editor-overlay {
      flex-direction: column;
      gap: 1rem;
      width: calc(100% - 2rem);
    }
  }
</style>
