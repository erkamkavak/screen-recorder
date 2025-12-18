<script lang="ts">
  import { timelineStore } from "../../../lib/stores/timeline";
  
  export let zoomDraft: boolean;
  export let onToggleZoomDraft: () => void;
  export let onDeleteSelected: () => void;
  export let onReset: () => void;

  $: canUndo = $timelineStore.historyIndex > 0;
  $: canRedo = $timelineStore.historyIndex < $timelineStore.history.length - 1;
</script>

<div class="timeline-toolbar">
  <button
    type="button"
    class="toolbar-btn primary"
    class:active={zoomDraft}
    on:click={onToggleZoomDraft}
    title={zoomDraft ? "Click timeline to place zoom" : "Add zoom"}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
    {zoomDraft ? "Pick a time" : "Add Zoom"}
  </button>

  <button
    type="button"
    class="toolbar-btn icon danger-hover"
    title="Delete selected event"
    disabled={!$timelineStore.selectedEvent}
    on:click={onDeleteSelected}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  </button>

  <div class="spacer"></div>

  <button type="button" class="toolbar-btn icon" title="Undo" disabled={!canUndo} on:click={() => timelineStore.undo()}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  </button>

  <button type="button" class="toolbar-btn icon" title="Redo" disabled={!canRedo} on:click={() => timelineStore.redo()}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  </button>

  <div class="toolbar-divider"></div>

  <button type="button" class="toolbar-btn icon" title="Reset timeline" on:click={onReset}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  </button>
</div>

<style>
  .timeline-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  
  .spacer {
    flex: 1;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 0.85rem;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  .toolbar-btn:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .toolbar-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: #f1f5f9;
  }
  
  .toolbar-btn.danger-hover:hover:not(:disabled) {
    background: #fff1f2;
    color: #e11d48;
    border-color: #fecdd3;
  }

  .toolbar-btn.primary {
    background: #1e293b; /* Slate-800 */
    color: white;
    border-color: #1e293b;
  }

  .toolbar-btn.primary:hover:not(:disabled) {
    background: #0f172a;
    border-color: #0f172a;
    color: white;
  }

  .toolbar-btn.primary.active {
    background: #1E2852; /* Brand Navy */
    border-color: #1E2852;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
  }

  .toolbar-btn.icon {
    padding: 0.5rem;
    min-width: 36px;
    aspect-ratio: 1;
  }

  .toolbar-divider {
    width: 1px;
    height: 1.5rem;
    background: #e2e8f0;
    margin: 0 0.5rem;
  }
</style>
