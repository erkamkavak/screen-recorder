<script lang="ts">
  import { fade, scale } from "svelte/transition";

  export let show: boolean;
  export let onContinueRecording: () => void;
  export let onResetAndNew: () => void;
  export let onCancel: () => void;
</script>

{#if show}
  <div
    class="modal-backdrop"
    on:click={onCancel}
    on:keydown={(e) => e.key === 'Escape' && onCancel()}
    role="button"
    tabindex="-1"
    aria-label="Close modal"
    transition:fade={{ duration: 200 }}
  />
  <div
    class="back-modal-wrapper"
    transition:scale={{ duration: 200, start: 0.95 }}
  >
    <div class="back-modal-content">
      <div class="modal-header">
        <div class="modal-icon-bg">
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h12a5 5 0 0 1 5 5v3" />
          </svg>
        </div>
        <h2>Exit Review</h2>
        <p>Choose how you'd like to return to the recorder.</p>
      </div>

      <div class="modal-choices">
        <button
          class="choice-btn primary-choice"
          on:click={onContinueRecording}
        >
          <div class="choice-text">
            <strong>Continue Recording</strong>
            <span
              >Keep your current work and quickly add more footage to it.</span
            >
          </div>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M5 12h14m-7-7 7 7-7 7" />
          </svg>
        </button>

        <button class="choice-btn danger-choice" on:click={onResetAndNew}>
          <div class="choice-text">
            <strong>Reset & New Project</strong>
            <span
              >Discard these changes and start a completely fresh recording.</span
            >
          </div>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
            />
          </svg>
        </button>
      </div>

      <button
        class="modal-cancel-btn"
        on:click={onCancel}
      >
        Maybe stay here
      </button>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(8px);
    z-index: 1000;
  }

  .back-modal-wrapper {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    width: 100%;
    max-width: 440px;
    padding: 20px;
  }

  .back-modal-content {
    background: #ffffff;
    border-radius: 28px;
    padding: 2rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25),
      0 0 0 1px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .modal-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .modal-icon-bg {
    width: 64px;
    height: 64px;
    background: #f8fafc;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3b82f6;
    margin-bottom: 0.5rem;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }

  .modal-header p {
    margin: 0;
    font-size: 0.9375rem;
    color: #64748b;
    line-height: 1.5;
  }

  .modal-choices {
    display: grid;
    gap: 1rem;
  }

  .choice-btn {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: #475569;
  }

  .choice-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
  }

  .primary-choice:hover {
    border-color: #3b82f6;
    background: #eff6ff;
    color: #1d4ed8;
  }

  .danger-choice:hover {
    border-color: #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .choice-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .choice-text strong {
    font-size: 1rem;
    font-weight: 700;
  }

  .choice-text span {
    font-size: 0.8125rem;
    opacity: 0.8;
    line-height: 1.4;
  }

  .modal-cancel-btn {
    background: transparent;
    border: none;
    padding: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #94a3b8;
    cursor: pointer;
    transition: color 0.2s;
  }

  .modal-cancel-btn:hover {
    color: #64748b;
  }
</style>
