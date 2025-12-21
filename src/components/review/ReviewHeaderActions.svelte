<script lang="ts">
  export let onSaveProject: () => void;
  export let isSavingProject: boolean = false;
  export let projectSaved: boolean = false;

  export let onContinueRecording: () => void;
  export let canContinueRecording: boolean = true;

  export let onOpenZoomEditor: () => void = () => {};
  export let isZoomEditorOpen: boolean = false;
</script>

<div class="header-actions">
  <button
    class="action-btn secondary pill"
    on:click={onOpenZoomEditor}
    title={isZoomEditorOpen ? "Zoom editor is open" : "Open zoom editor"}
    disabled={isZoomEditorOpen}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
    <span class="btn-label">Zoom editor</span>
  </button>
  <button
    class="action-btn secondary pill"
    on:click={onSaveProject}
    disabled={isSavingProject || projectSaved}
    title={projectSaved ? "Project Saved" : "Save Project"}
    class:success={projectSaved}
  >
    {#if isSavingProject}
      <svg
        class="spin"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        />
      </svg>
    {:else if projectSaved}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span class="btn-label">Saved</span>
    {:else}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      <span class="btn-label">Save</span>
    {/if}
  </button>

  <button
    class="action-btn primary pill"
    on:click={onContinueRecording}
    disabled={!canContinueRecording}
    title="Continue Recording"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
    <span class="btn-label">Continue</span>
  </button>
</div>

<style>
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: white;
    color: #475569;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn.pill {
    width: auto;
    padding: 0 0.75rem;
    gap: 0.45rem;
  }

  .btn-label {
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .action-btn:hover:not(:disabled) {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #1e293b;
  }

  .action-btn.success {
    background: #dcfce7;
    border-color: #86efac;
    color: #16a34a;
  }

  .action-btn.primary {
    background: #111827;
    border-color: #111827;
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: #1f2937;
    border-color: #1f2937;
    color: white;
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
