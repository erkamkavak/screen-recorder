<script lang="ts">
  import PointerStyleControls from "./PointerStyleControls.svelte";
  import TranscriptionSettingsModal from "./TranscriptionSettingsModal.svelte";
  import LayersIcon from "../icons/layers.icon.svelte";
  import CursorIcon from "../icons/cursor.icon.svelte";
  import MicIcon from "../icons/mic.icon.svelte";
  import ExportIcon from "../icons/export.icon.svelte";
  import { humanDuration } from "../../lib/utils/duration";
  import { backendAPI } from "../../lib/backend/backendAPI";
  import { transcriptionJob, transcriptionResult, transcriptionSettings } from "../../lib/stores/transcription";

  import { reviewSessionStore } from "../../lib/stores/reviewSession";
  import type { RenderFormatOption } from "../../lib/review/reviewTypes";

  export let asideWidthPx: number;

  export let hasWebcam: boolean;
  export let hasAudio: boolean;
  export let audioFilePath: string | null = null;

  export let captionsAvailable: boolean;

  let transcriptionProviders: string[] = [];
  let showTranscriptionSettings = false;
  let settingsProvider = "soniox";
  let settingsApiKey = "";
  let settingsApiBaseUrl = "https://api.soniox.com";

  $: if (showTranscriptionSettings) {
    settingsProvider = $transcriptionSettings.provider;
    settingsApiKey = $transcriptionSettings.apiKey;
    settingsApiBaseUrl = $transcriptionSettings.apiBaseUrl;
  }

  const openTranscriptionSettings = () => {
    showTranscriptionSettings = true;
  };

  const closeTranscriptionSettings = () => {
    showTranscriptionSettings = false;
  };

  const saveTranscriptionSettings = () => {
    transcriptionSettings.set({
      ...$transcriptionSettings,
      provider: settingsProvider,
      apiKey: settingsApiKey,
      apiBaseUrl: settingsApiBaseUrl,
    });
    showTranscriptionSettings = false;
  };

  const cancelTranscriptionJob = async () => {
    const jobId = $transcriptionJob.jobId;
    if (!jobId) return;
    try {
      await backendAPI.cancelTranscription(jobId);
    } catch {}
    transcriptionJob.set({ jobId: null, status: null, running: false, error: null });
  };

  const transcribeAudio = async () => {
    if (!audioFilePath) return;
    if (!$transcriptionSettings.apiKey && $transcriptionSettings.provider === "soniox") {
      showTranscriptionSettings = true;
      return;
    }

    transcriptionJob.set({ jobId: null, status: null, running: true, error: null });
    transcriptionResult.set(null);

    let jobId: string | null = null;
    try {
      const job = await backendAPI.submitTranscription({
        provider: $transcriptionSettings.provider,
        apiBaseUrl: $transcriptionSettings.apiBaseUrl,
        apiKey: $transcriptionSettings.apiKey,
        filePath: audioFilePath,
      });
      jobId = job.jobId;
      transcriptionJob.set({ jobId, status: null, running: true, error: null });

      while (true) {
        if (!$transcriptionJob.running || !jobId) return;
        const status = await backendAPI.getTranscriptionJob(jobId);
        if (status) {
          transcriptionJob.set({ jobId, status, running: true, error: status.errorMessage ?? null });
          if (status.status === "completed") break;
          if (status.status === "error" || status.status === "cancelled") {
            transcriptionJob.set({ jobId, status, running: false, error: status.errorMessage ?? "Transcription failed" });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      const result = await backendAPI.getTranscriptionResult(jobId);
      if (result) {
        transcriptionResult.set(result);
      }
      transcriptionJob.set({ jobId, status: $transcriptionJob.status, running: false, error: null });
    } catch (e) {
      transcriptionJob.set({ jobId, status: null, running: false, error: e instanceof Error ? e.message : "Transcription failed" });
    }
  };

  const loadProviders = async () => {
    try {
      transcriptionProviders = await backendAPI.listTranscriptionProviders();
      if (!transcriptionProviders.includes($transcriptionSettings.provider) && transcriptionProviders.length) {
        transcriptionSettings.set({
          ...$transcriptionSettings,
          provider: transcriptionProviders[0],
        });
      }
    } catch {
      transcriptionProviders = [];
    }
  };

  loadProviders();

  export let renderFormatOptions: RenderFormatOption[] = [];
  export let resolutionPresets: readonly { id: string; label: string; scale: number }[] = [];
  export let frameRatePresets: readonly { id: string; label: string; fps: number | "original" }[] = [];

  export let pointerIconOptions: readonly {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
  }[] = [];
  export let zipPointerImportMessage: string;
  export let onZipPointerFileChange: (event: Event) => void;

  export let isRenderingVideo: boolean;
  export let renderProgress: number;
  export let onRender: () => Promise<void>;
  export let onCancelRender: () => void;
  export let resetToRecorder: () => void;

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

  type SidebarTab = "layers" | "style" | "audio" | "export";
  let activeTab: SidebarTab = "layers";

</script>

<aside class="review-aside" style={`width: ${asideWidthPx}px;`}>
  <header class="aside-header">
    <h1>Review & Export</h1>
    <p class="aside-text">Customize your recording and export it to high-quality video.</p>
  </header>

  <nav class="tab-switcher">
    <button 
      class="tab-btn" 
      class:active={activeTab === 'layers'} 
      on:click={() => activeTab = 'layers'}
      title="Layers"
    >
      <div class="icon-w"><LayersIcon /></div>
      <span>Layers</span>
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'style'} 
      on:click={() => activeTab = 'style'}
      title="Cursor Style"
    >
      <div class="icon-w"><CursorIcon /></div>
      <span>Style</span>
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'audio'} 
      on:click={() => activeTab = 'audio'}
      title="Transcription"
    >
      <div class="icon-w"><MicIcon /></div>
      <span>Audio</span>
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'export'} 
      on:click={() => activeTab = 'export'}
      title="Export Settings"
    >
      <div class="icon-w"><ExportIcon /></div>
      <span>Export</span>
    </button>
  </nav>

  <div class="tab-content">
    {#if activeTab === 'layers'}
      <div class="section">
        <h2 class="section-title">Visible Tracks</h2>
        <div class="toggle-group">
          <label class="cb"><input type="checkbox" class="cb-input" bind:checked={$reviewSessionStore.includePointerTrack} /> <span>Include pointer</span></label>
          <label class="cb"><input type="checkbox" class="cb-input" bind:checked={$reviewSessionStore.includeClickTrack} /> <span>Show click interactions</span></label>
          <label class="cb" class:disabled={!hasWebcam}>
            <input type="checkbox" class="cb-input" bind:checked={$reviewSessionStore.includeWebcamTrack} disabled={!hasWebcam} />
            <span>Include webcam</span>
          </label>
          <label class="cb" class:disabled={!hasAudio}>
            <input type="checkbox" class="cb-input" bind:checked={$reviewSessionStore.includeAudioTrack} disabled={!hasAudio} />
            <span>Include audio</span>
          </label>
          <label class="cb" class:disabled={!captionsAvailable}>
            <input type="checkbox" class="cb-input" bind:checked={$reviewSessionStore.showCaptions} disabled={!captionsAvailable} />
            <span>Show captions</span>
          </label>
        </div>
      </div>
    {:else if activeTab === 'style'}
      <div class="tab-pane-fade">
        <PointerStyleControls
          {pointerIconOptions}
          {zipPointerImportMessage}
          {onZipPointerFileChange}
        />
      </div>
    {:else if activeTab === 'audio'}
      <div class="tab-pane-fade section">
        <h2 class="section-title">Transcription</h2>
        <p class="aside-text mb-4">Generate captions by transcribing the audio track.</p>
        <div class="button-stack">
          <button class="ts-secondary" on:click={openTranscriptionSettings} disabled={!hasAudio}>
            Transcription settings
          </button>
          <button class="primary" on:click={transcribeAudio} disabled={!hasAudio || $transcriptionJob.running}>
            {#if $transcriptionJob.running}
              Transcribing…
            {:else}
              Transcribe audio
            {/if}
          </button>
          {#if $transcriptionJob.running}
            <button class="danger" on:click={cancelTranscriptionJob}>
              Cancel transcription
            </button>
          {/if}
        </div>

        {#if $transcriptionJob.error}
          <p class="error-text">{$transcriptionJob.error}</p>
        {/if}
      </div>
    {:else if activeTab === 'export'}
      <div class="tab-pane-fade section">
        <h2 class="section-title">Format & Resolution</h2>
        <div class="format-field">
          <label class="field-label" for="render-format-select">Render format</label>
          <div class="select-wrapper">
            <select
              id="render-format-select"
              value={$reviewSessionStore.renderFormat}
              on:change={onRenderFormatSelect}
            >
              {#each renderFormatOptions as option}
                <option value={option.value} disabled={!option.supported}>
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
            <label class="field-label" for="resolution-preset-select">Resolution</label>
            <div class="select-wrapper">
              <select
                id="resolution-preset-select"
                value={$reviewSessionStore.selectedResolutionPreset}
                on:change={onResolutionPresetSelect}
              >
                {#each resolutionPresets as preset}
                  <option value={preset.id}>{preset.label}</option>
                {/each}
              </select>
            </div>
          </div>
        {/if}

        {#if frameRatePresets.length}
          <div class="format-field">
            <label class="field-label" for="framerate-preset-select">Frame rate</label>
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
        <span class="stat-label">Duration</span>
        <span class="stat-value">{humanDuration(Math.round(videoDuration))}</span>
      </div>
    </div>

    <div class="action-buttons">
      <button class="render-btn" on:click={onRender} disabled={isRenderingVideo}>
        {#if isRenderingVideo}
          <div class="render-progress-container">
            <div class="render-progress-bar" style={`width: ${renderProgress}%`} />
            <span class="render-btn-text">Rendering… {renderProgress}%</span>
          </div>
        {:else}
          <span class="render-btn-text">Render and download</span>
        {/if}
      </button>
      
      {#if isRenderingVideo}
        <button class="danger-outline" on:click={onCancelRender}>
          Cancel render
        </button>
      {/if}
      
      <button class="back-btn" on:click={resetToRecorder}>
        Back to recorder
      </button>
    </div>
  </div>

  <TranscriptionSettingsModal
    open={showTranscriptionSettings}
    {transcriptionProviders}
    bind:provider={settingsProvider}
    bind:apiBaseUrl={settingsApiBaseUrl}
    bind:apiKey={settingsApiKey}
    onClose={closeTranscriptionSettings}
    onSave={saveTranscriptionSettings}
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
    padding: 0.5rem;
    background: #f8fafc;
    gap: 0.25rem;
    border-bottom: 1px solid #f1f5f9;
  }

  .tab-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 0.6rem 0.25rem;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: #64748b;
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
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
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
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
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

  .mb-4 { margin-bottom: 1rem; }

  .aside-footer {
    padding: 1.5rem;
    background: #f8fafc;
    border-top: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .stats-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat {
    display: flex;
    flex-direction: column;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 500;
  }

  .stat-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: #0f172a;
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .render-btn {
    position: relative;
    width: 100%;
    padding: 0.875rem;
    background: #0f172a;
    color: white;
    border: none;
    border-radius: 14px;
    font-weight: 600;
    font-size: 0.9375rem;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.1s active;
  }

  .render-btn:hover:not(:disabled) {
    background: #1e293b;
  }

  .render-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .render-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .render-progress-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .render-progress-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: #3b82f6;
    transition: width 0.3s ease;
  }

  .render-btn-text {
    position: relative;
    z-index: 1;
  }

  .back-btn {
    padding: 0.75rem;
    background: transparent;
    color: #475569;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .back-btn:hover {
    background: #ffffff;
    border-color: #cbd5e1;
    color: #0f172a;
  }

  .danger-outline {
    padding: 0.75rem;
    background: #fff;
    color: #ef4444;
    border: 1px solid #fee2e2;
    border-radius: 14px;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .danger-outline:hover {
    background: #fef2f2;
    border-color: #fecaca;
  }

  .ts-secondary {
    padding: 0.75rem;
    background: #ffffff;
    color: #475569;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .ts-secondary:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .error-text {
    color: #ef4444;
    font-size: 0.8125rem;
    margin-top: 0.5rem;
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
