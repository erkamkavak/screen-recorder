<script lang="ts">
  import RangeInput from "../ui/RangeInput.svelte";

  export let pointerSize = 14;
  export let pointerIconSelection = "none";
  export let pointerIconOptions: readonly {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
  }[] = [];
  export let zipPointerImportMessage = "";
  export let onPointerSizeChange: (value: number) => void = () => {};
  export let onPointerIconSelect: (selection: string) => void = () => {};
  export let onZipPointerFileChange: (event: Event) => void = () => {};

  let pointerZipLabel = "No file selected";

  const handlePointerSizeInput = (event: CustomEvent<number>) => {
    onPointerSizeChange?.(event.detail);
  };

  const handlePointerIconSelect = (id: string) => {
    onPointerIconSelect?.(id);
  };

  const handleZipPointerFileInput = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    const fileName = target.files?.[0]?.name;
    pointerZipLabel = fileName ?? "No file selected";
    onZipPointerFileChange?.(event);
  };
</script>

<div class="pointer-style-panel">
  <h3>Pointer style</h3>
  <RangeInput
    name="pointerSize"
    title="Pointer size"
    min={6}
    max={64}
    step={2}
    value={pointerSize}
    on:input={handlePointerSizeInput}
    showPercentage={false}
  />
  <p class="pointer-hint">Choose a pointer shape below.</p>
  <div class="pointer-icon-options">
    {#each pointerIconOptions as option (option.id)}
      <button
        class={`pointer-icon-option ${pointerIconSelection === option.id ? "active" : ""}`}
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
    <label class="text-sm font-semibold text-slate-700 dark:text-slate-200">
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
    border-top: 1px solid #e5e7eb;
    padding-top: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .pointer-style-panel h3 {
    margin: 0;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #475569;
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
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 0.35rem 0.6rem;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.85rem;
    background: #fff;
    color: #334155;
    cursor: pointer;
  }

  .pointer-icon-option.active {
    border-color: #111827;
  }

  .pointer-icon-option-preview {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.45rem;
    border: 1px solid #cbd5e1;
    background-color: var(--option-background, #f97316);
    background-image: var(--option-icon, none);
    background-size: cover;
    background-position: center;
  }

  .pointer-zip-import {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .pointer-zip-message {
    margin: 0;
    font-size: 0.75rem;
    color: #475569;
  }
</style>
