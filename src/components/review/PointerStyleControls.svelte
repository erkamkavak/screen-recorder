<script lang="ts">
  import RangeInput from "../ui/RangeInput.svelte";

  import { reviewSessionStore } from "../../lib/stores/reviewSession";

  export let pointerIconOptions: readonly {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
  }[] = [];
  export let zipPointerImportMessage = "";
  export let onZipPointerFileChange: (event: Event) => void = () => {};

  let pointerZipLabel = "No file selected";

  const handlePointerSizeInput = (event: CustomEvent<number>) => {
    reviewSessionStore.setPointerIndicatorSize(event.detail);
  };

  const handlePointerIconSelect = (id: string) => {
    reviewSessionStore.setPointerIconSelection(id);
  };

  const handleZipPointerFileInput = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    const fileName = target.files?.[0]?.name;
    pointerZipLabel = fileName ?? "No file selected";
    onZipPointerFileChange?.(event);
  };
</script>

<div class="pointer-style-panel">
  <RangeInput
    name="pointerSize"
    title="Pointer size"
    min={6}
    max={64}
    step={2}
    value={$reviewSessionStore.pointerIndicatorSize}
    on:input={handlePointerSizeInput}
    showPercentage={false}
  />
  <p class="pointer-hint">Choose a pointer shape below.</p>
  <div class="pointer-icon-options">
    {#each pointerIconOptions as option (option.id)}
      <button
        class={`pointer-icon-option ${$reviewSessionStore.pointerIconSelection === option.id ? "active" : ""}`}
        type="button"
        on:click={() => handlePointerIconSelect(option.id)}
      >
        <span
          class="pointer-icon-option-preview"
          style={`--option-icon: ${option.data ?? "none"}; --option-background: ${
            option.data ? "transparent" : "#f97316"
          };`}
        />
        <span>{option.label}</span>
      </button>
    {/each}
  </div>
  <div class="pointer-zip-import">
    <label class="section-sub-title">
      Import cursor pack (.zip)
    </label>
    <div class="flex flex-wrap items-center gap-3">
      <label
        class="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
      >
        <span>Choose file</span>
        <input
          type="file"
          accept=".zip"
          class="sr-only"
          on:change={handleZipPointerFileInput}
        />
      </label>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {pointerZipLabel}
      </p>
    </div>
    {#if zipPointerImportMessage}
      <p class="pointer-zip-message">{zipPointerImportMessage}</p>
    {/if}
  </div>
</div>

<style>
  .pointer-style-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-sub-title {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }

  .pointer-hint {
    margin: 0;
    font-size: 0.75rem;
    color: #64748b;
  }

  .pointer-icon-options {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .pointer-icon-option {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 0.4rem 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #fff;
    color: #334155;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .pointer-icon-option:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
  }

  .pointer-icon-option.active {
    border-color: #3b82f6;
    background: #eff6ff;
    color: #1d4ed8;
  }

  .pointer-icon-option-preview {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    background-color: var(--option-background, #f97316);
    background-image: var(--option-icon, none);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
  }

  .pointer-zip-import {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 16px;
    border: 1px dashed #e2e8f0;
  }

  .pointer-zip-message {
    margin: 0;
    font-size: 0.75rem;
    color: #475569;
  }
</style>

