<script lang="ts">
  import RangeInput from "../ui/RangeInput.svelte";

  import { reviewSessionStore } from "../../lib/stores/reviewSession";

  export let pointerIconOptions: readonly {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
  }[] = [];
  export let removablePointerIconIds: string[] = [];
  export let zipPointerImportMessage = "";
  export let onZipPointerFileChange: (event: Event, providerId: string) => void = () => {};
  export let onRemovePointerIconOption: (id: string) => void = () => {};

  let pointerZipLabel = "No file selected";
  let showCursorPackModal = false;
  let selectedCursorPackSourceId = "sweezy";
  let cursorPackFileInput: HTMLInputElement | null = null;

  const cursorPackSources = [
    {
      id: "sweezy",
      name: "Sweezy Cursors",
      websiteLabel: "sweezy-cursors.com",
      websiteUrl: "https://sweezy-cursors.com/",
      description: "Download a cursor pack zip and import it here.",
      note: "Look for packs with separate cursor and pointer files.",
    },
  ] as const;

  const getSelectedCursorPackSource = () =>
    cursorPackSources.find((source) => source.id === selectedCursorPackSourceId) ??
    cursorPackSources[0];

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
    onZipPointerFileChange?.(event, selectedCursorPackSourceId);
  };

  const selectCursorPackSource = (id: string) => {
    selectedCursorPackSourceId = id;
    showCursorPackModal = false;
    cursorPackFileInput?.click();
  };

  let selectedCursorPackSource = getSelectedCursorPackSource();
  $: selectedCursorPackSource = getSelectedCursorPackSource();
</script>

<div class="pointer-style-panel" data-testid="cursor-style-section">
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
      <div class={`pointer-icon-option ${$reviewSessionStore.pointerIconSelection === option.id ? "active" : ""}`} data-testid="cursor-option">
        <button
          class="pointer-icon-option-main"
          type="button"
          on:click={() => handlePointerIconSelect(option.id)}
          data-testid="cursor-select"
        >
          <span
            class="pointer-icon-option-preview"
            style={`--option-icon: ${option.data ?? "none"}; --option-background: ${
              option.data ? "transparent" : "#f97316"
            };`}
          />
          <span>{option.label}</span>
        </button>
        {#if removablePointerIconIds.includes(option.id)}
          <button
            class="pointer-icon-option-remove"
            type="button"
            aria-label={`Remove ${option.label}`}
            on:click={() => onRemovePointerIconOption(option.id)}
          >
            ✕
          </button>
        {/if}
      </div>
    {/each}
  </div>
  <div class="pointer-zip-import">
    <label class="section-sub-title">
      Import cursor pack (.zip)
    </label>
    <div class="cursor-pack-meta">
      <div class="cursor-pack-meta-text">
        <span class="cursor-pack-label">{selectedCursorPackSource.name}</span>
        <a class="cursor-pack-link" href={selectedCursorPackSource.websiteUrl} target="_blank" rel="noreferrer">
          {selectedCursorPackSource.websiteLabel}
        </a>
      </div>
      <button class="cursor-pack-change" type="button" on:click={() => showCursorPackModal = true}>
        Change source
      </button>
    </div>
    <p class="cursor-pack-description">{selectedCursorPackSource.description}</p>
    <p class="cursor-pack-note">{selectedCursorPackSource.note}</p>
    <div class="flex flex-wrap items-center gap-3">
      <button
        class="cursor-pack-upload"
        type="button"
        on:click={() => cursorPackFileInput?.click()}
      >
        Choose pack zip
      </button>
      <input
        bind:this={cursorPackFileInput}
        type="file"
        accept=".zip"
        class="sr-only"
        on:change={handleZipPointerFileInput}
      />
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {pointerZipLabel}
      </p>
    </div>
    {#if zipPointerImportMessage}
      <p class="pointer-zip-message">{zipPointerImportMessage}</p>
    {/if}
  </div>
</div>

{#if showCursorPackModal}
  <div class="modal-backdrop" on:click={() => showCursorPackModal = false} />
  <div class="cursor-pack-modal">
    <div class="cursor-pack-modal-header">
      <div>
        <h3>Select cursor pack source</h3>
        <p>Pick where your cursor pack zip comes from.</p>
      </div>
      <button class="cursor-pack-close" type="button" on:click={() => showCursorPackModal = false}>
        ✕
      </button>
    </div>
    <div class="cursor-pack-options">
      {#each cursorPackSources as source (source.id)}
        <button class="cursor-pack-option" type="button" on:click={() => selectCursorPackSource(source.id)}>
          <div class="cursor-pack-option-header">
            <strong>{source.name}</strong>
            <span>{source.websiteLabel}</span>
          </div>
          <p>{source.description}</p>
          <small>{source.note}</small>
        </button>
      {/each}
    </div>
  </div>
{/if}

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
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: #fff;
    color: #334155;
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

  .pointer-icon-option-main {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.55rem 0.4rem 0.75rem;
    font-size: inherit;
    font-weight: inherit;
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

  .pointer-icon-option-remove {
    border: none;
    background: #fee2e2;
    color: #b91c1c;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 999px;
    width: 1.35rem;
    height: 1.35rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    margin-right: 0.4rem;
  }

  .pointer-icon-option-remove:hover {
    background: #fecaca;
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

  .cursor-pack-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .cursor-pack-meta-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .cursor-pack-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: #0f172a;
  }

  .cursor-pack-link {
    font-size: 0.75rem;
    color: #2563eb;
    text-decoration: none;
  }

  .cursor-pack-link:hover {
    text-decoration: underline;
  }

  .cursor-pack-change {
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.35rem 0.6rem;
    border-radius: 999px;
    cursor: pointer;
  }

  .cursor-pack-description {
    margin: 0;
    font-size: 0.8125rem;
    color: #475569;
  }

  .cursor-pack-note {
    margin: 0;
    font-size: 0.75rem;
    color: #64748b;
  }

  .cursor-pack-upload {
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.45rem 0.85rem;
    border-radius: 12px;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .cursor-pack-upload:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: 40;
  }

  .cursor-pack-modal {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(90vw, 420px);
    max-height: 80vh;
    background: #ffffff;
    border-radius: 20px;
    padding: 1.25rem;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow: hidden;
  }

  .cursor-pack-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .cursor-pack-modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #0f172a;
  }

  .cursor-pack-modal-header p {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
    color: #64748b;
  }

  .cursor-pack-close {
    border: none;
    background: #f1f5f9;
    color: #0f172a;
    font-size: 0.875rem;
    border-radius: 999px;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
  }

  .cursor-pack-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
  }

  .cursor-pack-option {
    text-align: left;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 0.85rem;
    background: #f8fafc;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
  }

  .cursor-pack-option:hover {
    border-color: #94a3b8;
    background: #ffffff;
    transform: translateY(-1px);
  }

  .cursor-pack-option-header {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.9rem;
    color: #0f172a;
  }

  .cursor-pack-option span {
    font-size: 0.75rem;
    color: #2563eb;
  }

  .cursor-pack-option p {
    margin: 0.5rem 0 0;
    font-size: 0.8125rem;
    color: #475569;
  }

  .cursor-pack-option small {
    display: block;
    margin-top: 0.4rem;
    font-size: 0.75rem;
    color: #64748b;
  }

  .pointer-zip-message {
    margin: 0;
    font-size: 0.75rem;
    color: #475569;
  }
</style>
