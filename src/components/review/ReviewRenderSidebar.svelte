<script lang="ts">
  import PointerStyleControls from "./PointerStyleControls.svelte";
  import TranscriptionSidebarSection from "./TranscriptionSidebarSection.svelte";
  import CinematicEffectsSection from "./CinematicEffectsSection.svelte";
  import LayersIcon from "../icons/layers.icon.svelte";
  import CinemaIcon from "../icons/cinema.icon.svelte";
  import CursorIcon from "../icons/cursor.icon.svelte";
  import MicIcon from "../icons/mic.icon.svelte";
  import ExportIcon from "../icons/export.icon.svelte";
  import CloseIcon from "../icons/close.icon.svelte";
  import RecordingIcon from "../icons/stop.icon.svelte";
  import { humanDuration } from "../../lib/utils/duration";
  import BackConfirmationModal from "./BackConfirmationModal.svelte";
  import { 
    reviewSessionStore, 
    pointerRecords 
  } from "../../lib/stores/reviewSession";
  import type { RenderFormatOption } from "../../lib/review/reviewTypes";
  import { fade, scale } from "svelte/transition";

  export let asideWidthPx: number;

  export let hasWebcam: boolean;
  export let hasAudio: boolean;
  export let audioFilePath: string | null = null;

  export let captionsAvailable: boolean;
  export let renderFormatOptions: RenderFormatOption[] = [];
  export let resolutionPresets: readonly {
    id: string;
    label: string;
    scale: number;
  }[] = [];
  export let frameRatePresets: readonly {
    id: string;
    label: string;
    fps: number | "original";
  }[] = [];

  export let pointerIconOptions: readonly {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
  }[] = [];
  export let removablePointerIconIds: string[] = [];
  export let zipPointerImportMessage: string;
  export let onZipPointerFileChange: (event: Event, providerId: string) => void;
  export let onRemovePointerIconOption: (id: string) => void;

  export let isRenderingVideo: boolean;
  export let renderProgress: number;
  export let onRender: () => Promise<void>;
  export let onCancelRender: () => void;
  export let resetToRecorder: () => void;
  export let onResetAndNew: () => void;
  export let onContinueRecording: () => void;

  export let videoDuration: number;

  const onRenderFormatSelect = (e: Event) => {
    const val = (e.currentTarget as HTMLSelectElement).value;
    reviewSessionStore.setRenderFormat(val as any);
  };

  const onResolutionPresetSelect = (e: Event) => {
    const val = (e.currentTarget as HTMLSelectElement).value;
    reviewSessionStore.setSelectedResolutionPreset(val as any);
  };

  const onFrameRatePresetSelect = (e: Event) => {
    const val = (e.currentTarget as HTMLSelectElement).value;
    reviewSessionStore.setSelectedFrameRatePreset(val as any);
  };

  type SidebarTab = "layers" | "cinema" | "style" | "audio" | "export";
  let activeTab: SidebarTab = "layers";

  let showBackConfirmation = false;
</script>

<aside class="review-aside" style={`width: ${asideWidthPx}px;`}>
  <header class="aside-header">
    <h1>Review & Export</h1>
    <p class="aside-text">
      Customize your recording and export it to high-quality video.
    </p>
  </header>

  <nav class="tab-switcher">
    <button
      class="tab-btn"
      class:active={activeTab === "layers"}
      on:click={() => (activeTab = "layers")}
      title="Layers"
      data-testid="layers-tab-btn"
    >
      <div class="icon-w"><LayersIcon /></div>
      <span>Layers</span>
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === "style"}
      on:click={() => (activeTab = "style")}
      title="Cursor Style"
      data-testid="style-tab-btn"
    >
      <div class="icon-w"><CursorIcon /></div>
      <span>Style</span>
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === "cinema"}
      on:click={() => (activeTab = "cinema")}
      title="Cinematic Effects"
      data-testid="cinema-tab-btn"
    >
      <div class="icon-w"><CinemaIcon /></div>
      <span>Cinema</span>
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === "audio"}
      on:click={() => (activeTab = "audio")}
      title="Transcription"
      data-testid="audio-tab-btn"
    >
      <div class="icon-w"><MicIcon /></div>
      <span>Audio</span>
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === "export"}
      on:click={() => (activeTab = "export")}
      title="Export Settings"
      data-testid="export-tab-btn"
    >
      <div class="icon-w"><ExportIcon /></div>
      <span>Export</span>
    </button>
  </nav>

  <div class="tab-content">
    {#if activeTab === "layers"}
      <div class="section" data-testid="layers-tab">
        <h2 class="section-title">Visible Tracks</h2>
        <div class="toggle-group">
          <label class="cb"
            ><input
              type="checkbox"
              class="cb-input"
              bind:checked={$reviewSessionStore.includePointerTrack}
            /> <span>Include pointer</span></label
          >
          <label class="cb"
            ><input
              type="checkbox"
              class="cb-input"
              bind:checked={$reviewSessionStore.includeClickTrack}
            /> <span>Show click interactions</span></label
          >
          <label class="cb" class:disabled={!hasWebcam}>
            <input
              type="checkbox"
              class="cb-input"
              bind:checked={$reviewSessionStore.includeWebcamTrack}
              disabled={!hasWebcam}
              data-testid="webcam-toggle"
            />
            <span>Include webcam</span>
          </label>
          <label class="cb" class:disabled={!hasAudio}>
            <input
              type="checkbox"
              class="cb-input"
              bind:checked={$reviewSessionStore.includeAudioTrack}
              disabled={!hasAudio}
              data-testid="audio-toggle"
            />
            <span>Include audio</span>
          </label>
        </div>
      </div>
    {:else if activeTab === "style"}
      <div class="tab-pane-fade" data-testid="cursor-style-tab">
        <PointerStyleControls
          {pointerIconOptions}
          {removablePointerIconIds}
          {zipPointerImportMessage}
          {onZipPointerFileChange}
          {onRemovePointerIconOption}
        />
      </div>
    {:else if activeTab === "cinema"}
      <div class="tab-pane-fade" data-testid="cinema-tab">
        <CinematicEffectsSection />
      </div>
    {:else if activeTab === "audio"}
      <div data-testid="audio-tab">
        <TranscriptionSidebarSection {hasAudio} {audioFilePath} />
      </div>
    {:else if activeTab === "export"}
      <div class="tab-pane-fade section" data-testid="export-tab">
        <h2 class="section-title">Format & Resolution</h2>
        <div class="format-field">
          <label class="field-label" for="render-format-select"
            >Render format</label
          >
          <div class="select-wrapper">
            <select
              id="render-format-select"
              value={$reviewSessionStore.renderFormat}
              on:change={onRenderFormatSelect}
              data-testid="format-select"
            >
              {#each renderFormatOptions as option}
                <option value={option.value} disabled={!option.supported} data-testid="format-option">
                  {option.label}
                  {#if !option.supported}
                    {" (unsupported)"}
                  {/if}
                </option>
              {/each}
            </select>
          </div>
        </div>

        {#if resolutionPresets.length}
          <div class="format-field">
            <label class="field-label" for="resolution-preset-select"
              >Resolution</label
            >
            <div class="select-wrapper">
              <select
                id="resolution-preset-select"
                value={$reviewSessionStore.selectedResolutionPreset}
                on:change={onResolutionPresetSelect}
                data-testid="resolution-preset"
              >
                {#each resolutionPresets as preset}
                  <option value={preset.id} data-testid="preset-option">{preset.label}</option>
                {/each}
              </select>
            </div>
          </div>
        {/if}

        {#if frameRatePresets.length}
          <div class="format-field">
            <label class="field-label" for="framerate-preset-select"
              >Frame rate</label
            >
            <div class="select-wrapper">
              <select
                id="framerate-preset-select"
                value={$reviewSessionStore.selectedFrameRatePreset}
                on:change={onFrameRatePresetSelect}
              >
                {#each frameRatePresets as preset}
                  <option value={preset.id}>{preset.label}</option>
                {/each}
              </select>
            </div>
          </div>
        {/if}

      </div>
    {/if}
  </div>

  <div class="aside-footer">
    <div class="stats-row">
      <div class="stat">
        <span class="stat-label">Project duration</span>
        <span class="stat-value"
          >{humanDuration(Math.round(videoDuration))}</span
        >
      </div>
    </div>

    <div class="action-buttons">
      <button
        class="render-btn"
        on:click={onRender}
        disabled={isRenderingVideo}
        class:is-rendering={isRenderingVideo}
        data-testid="render-btn"
      >
        {#if isRenderingVideo}
          <div class="render-progress-overlay" style={`width: ${renderProgress}%`} data-testid="render-progress" />
          <div class="render-btn-content">
            <div class="loading-spinner-tiny" />
            <span class="render-btn-text">Exporting... {renderProgress}%</span>
          </div>
        {:else}
          <div class="render-btn-content">
            <div class="icon-tiny"><ExportIcon /></div>
            <span class="render-btn-text">Render & Download</span>
          </div>
        {/if}
      </button>

      {#if isRenderingVideo}
        <button class="cancel-render-btn" on:click={onCancelRender} transition:fade>
          <div class="icon-tiny-red"><CloseIcon /></div>
          <span>Cancel export</span>
        </button>
      {/if}

      <button class="back-to-rec-btn" on:click={() => (showBackConfirmation = true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>Back to recorder</span>
      </button>
    </div>
  </div>

  <BackConfirmationModal 
    show={showBackConfirmation} 
    {onContinueRecording} 
    {onResetAndNew} 
    onCancel={() => showBackConfirmation = false}
  />
</aside>

<style>
  .review-aside {
    flex: 0 0 auto;
    min-width: 20rem;
    border-radius: 24px;
    border: 1px solid #e2e8f0;
    padding: 0;
    background: #ffffff;
    box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 1.5rem;
    align-self: flex-start;
    overflow: hidden;
    height: calc(100vh - 3rem);
  }

  .aside-header {
    padding: 1.5rem;
    border-bottom: 1px solid #f1f5f9;
  }

  .aside-header h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
  }

  .aside-text {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: #64748b;
    line-height: 1.5;
  }

  .tab-switcher {
    display: flex;
    padding: 0.75rem;
    background: #f8fafc;
    gap: 0.5rem;
    border-bottom: 1px solid #f1f5f9;
  }

  .tab-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.25rem;
    border: none;
    border-radius: 14px;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tab-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .tab-btn.active {
    background: #ffffff;
    color: #3b82f6;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.04), 0 4px 6px -2px rgba(0, 0, 0, 0.02), 0 0 0 1px rgba(0, 0, 0, 0.02);
  }

  .tab-btn .icon-w {
    width: 20px;
    height: 20px;
    transition: transform 0.2s ease;
  }

  .tab-btn.active .icon-w {
    transform: scale(1.1);
  }

  .tab-btn span {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .tab-pane-fade {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .aside-footer {
    padding: 1.5rem;
    background: #ffffff;
    border-top: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 -10px 20px -10px rgba(0, 0, 0, 0.04);
    z-index: 10;
  }

  .stats-row {
    display: flex;
    justify-content: flex-start;
    align-items: center;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .stat-label {
    font-size: 0.65rem;
    color: #94a3b8;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .render-btn {
    position: relative;
    width: 100%;
    height: 3.5rem;
    background: #0f172a;
    color: white;
    border: none;
    border-radius: 16px;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    overflow: hidden;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.2);
  }

  .render-btn:hover:not(:disabled) {
    background: #1e293b;
    transform: translateY(-1px);
    box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.2);
  }

  .render-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.2);
  }

  .render-btn.is-rendering {
    cursor: default;
    background: #1e293b;
  }

  .render-progress-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, #3b82f6, #2563eb);
    transform-origin: left;
    transition: width 0.4s cubic-bezier(0.1, 0.7, 0.1, 1);
  }

  .render-progress-overlay::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .render-btn-content {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
  }

  .render-btn-text {
    letter-spacing: -0.01em;
  }

  .icon-tiny {
    width: 20px;
    height: 20px;
  }

  .loading-spinner-tiny {
    width: 18px;
    height: 18px;
    border: 2.5px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .cancel-render-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #fffafa;
    color: #ef4444;
    border: 1.5px solid #fee2e2;
    border-radius: 14px;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-render-btn:hover {
    background: #fff1f1;
    border-color: #fecaca;
    color: #dc2626;
  }

  .icon-tiny-red {
    width: 14px;
    height: 14px;
    color: currentColor;
  }

  .back-to-rec-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 0.875rem;
    background: transparent;
    color: #64748b;
    border: 1.5px solid #e2e8f0;
    border-radius: 16px;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 0.25rem;
  }

  .back-to-rec-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #334155;
    transform: translateY(-1px);
  }

  @media (max-width: 1024px) {
    .review-aside {
      position: static;
      width: auto !important;
      flex: 1 1 auto;
      height: auto;
    }
  }
</style>
