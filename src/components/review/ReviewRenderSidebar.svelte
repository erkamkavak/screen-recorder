<script lang="ts">
  import PointerStyleControls from "./PointerStyleControls.svelte";
  import TranscriptionSettingsModal from "./TranscriptionSettingsModal.svelte";
  import LayersIcon from "../icons/layers.icon.svelte";
  import CursorIcon from "../icons/cursor.icon.svelte";
  import MicIcon from "../icons/mic.icon.svelte";
  import ExportIcon from "../icons/export.icon.svelte";
  import { humanDuration } from "../../lib/utils/duration";
  import { backendAPI } from "../../lib/backend/backendAPI";
  import {
    transcriptionSettings,
    transcriptionJob,
    transcriptionVersions,
    activeTranscriptionId,
    transcriptionResult,
  } from "../../lib/stores/transcription";

  import { reviewSessionStore } from "../../lib/stores/reviewSession";
  import type { RenderFormatOption } from "../../lib/review/reviewTypes";
  import { fade, scale } from "svelte/transition";

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
  let settingsSelectedModel = "";

  const openTranscriptionSettings = () => {
    settingsProvider = $transcriptionSettings.provider;
    settingsApiKey = $transcriptionSettings.apiKey;
    settingsApiBaseUrl = $transcriptionSettings.apiBaseUrl;
    settingsSelectedModel = $transcriptionSettings.selectedModel;
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
      selectedModel: settingsSelectedModel,
    });
    showTranscriptionSettings = false;
  };

  const cancelTranscriptionJob = async () => {
    const jobId = $transcriptionJob.jobId;
    if (!jobId) return;
    try {
      await backendAPI.cancelTranscription(jobId);
    } catch {}
    transcriptionJob.set({
      jobId: null,
      status: null,
      running: false,
      error: null,
    });
  };

  const isLocalProvider = (p: string) => {
    const lp = p?.toLowerCase();
    return ["whisper", "parakeet", "local"].includes(lp);
  };

  const transcribeAudio = async () => {
    if (!audioFilePath) return;

    const provider = $transcriptionSettings.provider;

    // For cloud providers, require API key
    if (
      provider?.toLowerCase() === "soniox" &&
      !$transcriptionSettings.apiKey
    ) {
      showTranscriptionSettings = true;
      return;
    }

    // For local providers, require a downloaded model
    if (isLocalProvider(provider) && !$transcriptionSettings.selectedModel) {
      showTranscriptionSettings = true;
      return;
    }

    transcriptionJob.set({
      jobId: null,
      status: null,
      running: true,
      error: null,
    });
    // Don't clear versions, just let them be, or maybe add a new job.

    let jobId: string | null = null;
    try {
      const job = await backendAPI.submitTranscription({
        provider: $transcriptionSettings.provider,
        apiBaseUrl: $transcriptionSettings.apiBaseUrl,
        apiKey: $transcriptionSettings.apiKey,
        filePath: audioFilePath,
        model: $transcriptionSettings.selectedModel || undefined,
      });
      jobId = job.jobId;
      transcriptionJob.set({ jobId, status: null, running: true, error: null });

      while (true) {
        if (!$transcriptionJob.running || !jobId) return;
        const status = await backendAPI.getTranscriptionJob(jobId);
        if (status) {
          transcriptionJob.set({
            jobId,
            status,
            running: true,
            error: status.errorMessage ?? null,
          });
          if (status.status === "completed") break;
          if (status.status === "error" || status.status === "cancelled") {
            transcriptionJob.set({
              jobId,
              status,
              running: false,
              error: status.errorMessage ?? "Transcription failed",
            });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      const result = await backendAPI.getTranscriptionResult(jobId);
      console.log("[TRANSCRIPTION] Got result:", result);
      console.log("[TRANSCRIPTION] Segments:", result?.segments);
      if (result) {
        const versionId = crypto.randomUUID();
        console.log("[TRANSCRIPTION] Creating version:", versionId);
        transcriptionVersions.update((v) => [
          ...v,
          {
            id: versionId,
            provider: $transcriptionSettings.provider,
            model: $transcriptionSettings.selectedModel,
            result,
            timestamp: Date.now(),
          },
        ]);
        activeTranscriptionId.set(versionId);
        console.log("[TRANSCRIPTION] Version added, total versions:", $transcriptionVersions.length);
      } else {
        console.log("[TRANSCRIPTION] Result was null/undefined");
      }
      transcriptionJob.set({
        jobId,
        status: $transcriptionJob.status,
        running: false,
        error: null,
      });
    } catch (e) {
      transcriptionJob.set({
        jobId,
        status: null,
        running: false,
        error: e instanceof Error ? e.message : "Transcription failed",
      });
    }
  };

  const loadProviders = async () => {
    try {
      transcriptionProviders = await backendAPI.listTranscriptionProviders();
      if (
        !transcriptionProviders.includes($transcriptionSettings.provider) &&
        transcriptionProviders.length
      ) {
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

  type SidebarTab = "layers" | "style" | "audio" | "export";
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
    >
      <div class="icon-w"><LayersIcon /></div>
      <span>Layers</span>
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === "style"}
      on:click={() => (activeTab = "style")}
      title="Cursor Style"
    >
      <div class="icon-w"><CursorIcon /></div>
      <span>Style</span>
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === "audio"}
      on:click={() => (activeTab = "audio")}
      title="Transcription"
    >
      <div class="icon-w"><MicIcon /></div>
      <span>Audio</span>
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === "export"}
      on:click={() => (activeTab = "export")}
      title="Export Settings"
    >
      <div class="icon-w"><ExportIcon /></div>
      <span>Export</span>
    </button>
  </nav>

  <div class="tab-content">
    {#if activeTab === "layers"}
      <div class="section">
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
            />
            <span>Include webcam</span>
          </label>
          <label class="cb" class:disabled={!hasAudio}>
            <input
              type="checkbox"
              class="cb-input"
              bind:checked={$reviewSessionStore.includeAudioTrack}
              disabled={!hasAudio}
            />
            <span>Include audio</span>
          </label>
        </div>
      </div>
    {:else if activeTab === "style"}
      <div class="tab-pane-fade">
        <PointerStyleControls
          {pointerIconOptions}
          {removablePointerIconIds}
          {zipPointerImportMessage}
          {onZipPointerFileChange}
          {onRemovePointerIconOption}
        />
      </div>
    {:else if activeTab === "audio"}
      <div class="tab-pane-fade section">
        <div class="transcription-header">
          <div class="field-info">
            <h2 class="field-label-premium">TRANSCRIPTION</h2>
            <p class="field-description">Auto-generate captions from audio</p>
          </div>
          <button
            class="settings-btn-premium"
            on:click={openTranscriptionSettings}
            disabled={!hasAudio}
            title="Configure transcription"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l-.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>

        <div class="transcription-status" class:disabled={!hasAudio}>
          {#if !hasAudio}
            <div class="status-box empty">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20M5 7l7-5 7 5M5 17l7 5 7-5"/>
              </svg>
              <span>Audio track unavailable</span>
            </div>
          {:else if $transcriptionJob.running}
            <div class="status-box running">
              <div class="loading-ring"></div>
              <div class="status-details">
                <span class="status-main">Transcribing...</span>
                {#if $transcriptionJob.status?.progress}
                  <div class="mini-progress-bg">
                    <div class="mini-progress-fill" style="width: {Math.round(($transcriptionJob.status.progress || 0) * 100)}%"></div>
                  </div>
                {/if}
              </div>
              <button class="small-cancel-btn" on:click={cancelTranscriptionJob}>Stop</button>
            </div>
          {:else if $transcriptionVersions.length > 0}
            <div class="captions-visibility-row">
              <div class="visibility-info">
                <span class="visibility-title">Overlay Captions</span>
                <span class="visibility-desc">Display text on video canvas</span>
              </div>
              <label class="premium-switch">
                <input type="checkbox" bind:checked={$reviewSessionStore.showCaptions} />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="audio-settings-card">
              <div class="versions-section-compact">
                <div class="field-header">
                  <label class="field-label-small" for="version-select">Active Version</label>
                </div>
                <div class="select-wrapper-premium">
                  <select id="version-select" value={$activeTranscriptionId} on:change={(e) => activeTranscriptionId.set(e.currentTarget.value)}>
                    {#each $transcriptionVersions as v}
                      <option value={v.id}>
                        {v.provider} {v.model ? `- ${v.model}` : ''} ({new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                      </option>
                    {/each}
                  </select>
                </div>
              </div>

              <div class="styling-section">
                <div class="style-row-compact">
                  <div class="style-item">
                    <label class="field-label-small" for="caption-font-size">Font Size</label>
                    <div class="slider-container">
                      <input id="caption-font-size" type="range" min="12" max="120" step="1" bind:value={$reviewSessionStore.captionFontSize} />
                      <span class="value-badge">{$reviewSessionStore.captionFontSize}px</span>
                    </div>
                  </div>

                  <div class="style-item">
                    <label class="field-label-small" for="caption-hex-color">Text Color</label>
                    <div class="color-picker-group">
                      <div class="color-preview" style="background: {$reviewSessionStore.captionColor}">
                        <input type="color" bind:value={$reviewSessionStore.captionColor} title="Choose color" />
                      </div>
                      <div class="hex-input-wrapper">
                        <input id="caption-hex-color" type="text" class="hex-input" bind:value={$reviewSessionStore.captionColor} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <div class="status-box ready">
              <div class="ready-dot"></div>
              <span>Ready to process</span>
            </div>
          {/if}
        </div>

        {#if $transcriptionJob.error}
          <div class="error-alert">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" /><line
                x1="12"
                y1="8"
                x2="12"
                y2="12"
              /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{$transcriptionJob.error}</span>
          </div>
        {/if}

        <button
          class="transcribe-btn-premium"
          on:click={transcribeAudio}
          disabled={$transcriptionJob.running || !hasAudio}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
          <span>{$transcriptionVersions.length > 0 ? 'Generate New Transcription' : 'Start Transcription'}</span>
        </button>
      </div>
    {:else if activeTab === "export"}
      <div class="tab-pane-fade section">
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
            <label class="field-label" for="resolution-preset-select"
              >Resolution</label
            >
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
        <span class="stat-label">Duration</span>
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
      >
        {#if isRenderingVideo}
          <div class="render-progress-container">
            <div
              class="render-progress-bar"
              style={`width: ${renderProgress}%`}
            />
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

      <button class="back-btn" on:click={() => (showBackConfirmation = true)}>
        Back to recorder
      </button>
    </div>
  </div>

  {#if showBackConfirmation}
    <div
      class="modal-backdrop"
      on:click={() => (showBackConfirmation = false)}
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
          on:click={() => (showBackConfirmation = false)}
        >
          Maybe stay here
        </button>
      </div>
    </div>
  {/if}

  <TranscriptionSettingsModal
    open={showTranscriptionSettings}
    {transcriptionProviders}
    bind:provider={settingsProvider}
    bind:apiBaseUrl={settingsApiBaseUrl}
    bind:apiKey={settingsApiKey}
    bind:selectedModel={settingsSelectedModel}
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

  /* Transcription Styles */
  .transcription-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.25rem;
  }

  .field-label-premium {
    font-size: 0.8125rem;
    font-weight: 800;
    color: #475569;
    letter-spacing: 0.05em;
    margin: 0 0 0.25rem 0;
  }

  .field-description {
    font-size: 0.875rem;
    color: #94a3b8;
    margin: 0;
  }

  .settings-btn-premium {
    padding: 0.5rem;
    background: #f1f5f9;
    border: none;
    border-radius: 8px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
  }

  .settings-btn-premium:hover:not(:disabled) {
    background: #e2e8f0;
    color: #334155;
  }

  .transcription-status {
    margin-bottom: 1.25rem;
  }

  .transcription-status.disabled {
    opacity: 0.5;
  }

  .status-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    border-radius: 16px;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .status-box.empty {
    color: #94a3b8;
  }
  .status-box.ready {
    color: #64748b;
  }
  .status-box.complete {
    color: #16a34a;
    background: #f0fdf4;
    border-color: #dcfce7;
  }
  .status-box.running {
    color: #3b82f6;
    background: #eff6ff;
    border-color: #dbeafe;
  }

  .ready-dot {
    width: 8px;
    height: 8px;
    background: #cbd5e1;
    border-radius: 50%;
  }
  .success-dot {
    width: 8px;
    height: 8px;
    background: #22c55e;
    border-radius: 50%;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
  }

  .loading-ring {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(59, 130, 246, 0.2);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: ring-spin 0.8s linear infinite;
  }

  @keyframes ring-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .status-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .mini-progress-bg {
    height: 4px;
    background: rgba(59, 130, 246, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .mini-progress-fill {
    height: 100%;
    background: #3b82f6;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .small-cancel-btn {
    padding: 0.375rem 0.625rem;
    background: #ffffff;
    color: #475569;
    border: 1px solid #dbeafe;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .small-cancel-btn:hover {
    background: #fef2f2;
    color: #ef4444;
    border-color: #fee2e2;
  }

  .error-alert {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.875rem 1rem;
    background: #fef2f2;
    border: 1px solid #fee2e2;
    border-radius: 12px;
    color: #ef4444;
    font-size: 0.8125rem;
    font-weight: 600;
    margin-bottom: 1.25rem;
  }

  .transcribe-btn-premium {
    width: 100%;
    height: 3.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0 1.5rem;
    background: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 16px;
    font-size: 0.9375rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
    margin-top: 1rem;
  }

  .transcribe-btn-premium:hover:not(:disabled) {
    background: #1e293b;
    transform: translateY(-1px);
    box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.2);
  }

  .transcribe-btn-premium:active:not(:disabled) {
    transform: translateY(0);
  }

  .transcribe-btn-premium:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #94a3b8;
    box-shadow: none;
  }

  /* Modal Styles */
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

  .captions-visibility-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #f1f5f9;
    margin-bottom: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  }

  .visibility-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .visibility-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: #1e293b;
  }

  .visibility-desc {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .premium-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .premium-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .switch-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: #e2e8f0;
    transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 24px;
  }

  .switch-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .premium-switch input:checked + .switch-slider {
    background-color: #3b82f6;
  }

  .premium-switch input:checked + .switch-slider:before {
    transform: translateX(20px);
  }

  .audio-settings-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0;
  }

  .versions-section-compact {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    background: #f0f7ff;
    border-radius: 16px;
    border: 1px solid #e1e7ff;
  }

  .styling-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #f1f5f9;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  }

  .style-row-compact {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field-label-small {
    font-size: 0.8125rem;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .cb-show {
    display: none;
  }

  .cb-show input {
    width: 16px;
    height: 16px;
    accent-color: #4f46e5;
    cursor: pointer;
  }

  .select-wrapper-premium {
    position: relative;
    width: 100%;
  }

  .select-wrapper-premium select {
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    border: 1.5px solid #3b82f6;
    background: #ffffff;
    font-size: 0.9375rem;
    font-weight: 500;
    color: #1e293b;
    appearance: none;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.08);
  }

  .select-wrapper-premium::after {
    content: "";
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 10px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233b82f6'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    background-size: contain;
    background-repeat: no-repeat;
    pointer-events: none;
  }

  .style-item {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .slider-container {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .slider-container input[type="range"] {
    flex: 1;
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    appearance: none;
    outline: none;
  }

  .slider-container input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    transition: transform 0.2s;
  }

  .slider-container input[type="range"]:active::-webkit-slider-thumb {
    transform: scale(1.1);
  }

  .value-badge {
    padding: 0.375rem 0.625rem;
    background: #f1f5f9;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #334155;
    min-width: 44px;
    text-align: center;
  }

  .color-picker-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .color-preview {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    position: relative;
    cursor: pointer;
    overflow: hidden;
    flex-shrink: 0;
  }

  .color-preview input[type="color"] {
    position: absolute;
    top: -5px;
    left: -5px;
    width: 50px;
    height: 50px;
    opacity: 0;
    cursor: pointer;
  }

  .hex-input-wrapper {
    flex: 1;
  }

  .hex-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.875rem;
    color: #475569;
    letter-spacing: 0.05em;
  }

  .hex-input:focus {
    outline: none;
    border-color: #cbd5e1;
    background: #f1f5f9;
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
