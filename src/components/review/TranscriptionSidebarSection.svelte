<script lang="ts">
  import { backendAPI } from "../../lib/backend/backendAPI";
  import { transcriptionSettings } from "../../lib/stores/transcription";
  import { reviewSessionStore } from "../../lib/stores/reviewSession";
  import TranscriptionSettingsModal from "./TranscriptionSettingsModal.svelte";
  import { onMount } from "svelte";

  export let hasAudio: boolean;
  export let audioFilePath: string | null = null;

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
    const jobId = $reviewSessionStore.transcriptionJob.jobId;
    if (!jobId) return;
    try {
      await backendAPI.cancelTranscription(jobId);
    } catch {}
    reviewSessionStore.setTranscriptionJob({
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

    if (provider?.toLowerCase() === "soniox" && !$transcriptionSettings.apiKey) {
      showTranscriptionSettings = true;
      return;
    }

    if (isLocalProvider(provider) && !$transcriptionSettings.selectedModel) {
      showTranscriptionSettings = true;
      return;
    }

    reviewSessionStore.setTranscriptionJob({
      jobId: null,
      status: null,
      running: true,
      error: null,
    });

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
      reviewSessionStore.setTranscriptionJob({ jobId, status: null, running: true, error: null });

      while (true) {
        if (!$reviewSessionStore.transcriptionJob.running || !jobId) return;
        const status = await backendAPI.getTranscriptionJob(jobId);
        if (status) {
          reviewSessionStore.setTranscriptionJob({
            jobId,
            status,
            running: true,
            error: status.errorMessage ?? null,
          });
          if (status.status === "completed") break;
          if (status.status === "error" || status.status === "cancelled") {
            reviewSessionStore.setTranscriptionJob({
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
      if (result && $reviewSessionStore.transcriptionJob.running && $reviewSessionStore.transcriptionJob.jobId === jobId) {
        const versionId = crypto.randomUUID();
        const currentVersions = $reviewSessionStore.transcriptionVersions;
        reviewSessionStore.setTranscriptionVersions([
          ...currentVersions,
          {
            id: versionId,
            provider: $transcriptionSettings.provider,
            model: $transcriptionSettings.selectedModel,
            result,
            timestamp: Date.now(),
            sourceAudioPath: audioFilePath,
          },
        ]);
        reviewSessionStore.setActiveTranscriptionId(versionId);
      }
      reviewSessionStore.setTranscriptionJob({
        jobId,
        status: $reviewSessionStore.transcriptionJob.status,
        running: false,
        error: null,
      });
    } catch (e) {
      reviewSessionStore.setTranscriptionJob({
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

  onMount(() => {
    loadProviders();
  });

  $: hasVersions = ($reviewSessionStore.transcriptionVersions || []).length > 0;
</script>

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
    {:else if $reviewSessionStore.transcriptionJob.running}
      <div class="status-box running">
        <div class="loading-ring"></div>
        <div class="status-details">
          <span class="status-main">Transcribing...</span>
          {#if $reviewSessionStore.transcriptionJob.status?.progress}
            <div class="mini-progress-bg">
              <div class="mini-progress-fill" style="width: {Math.round(($reviewSessionStore.transcriptionJob.status.progress || 0) * 100)}%"></div>
            </div>
          {/if}
        </div>
        <button class="small-cancel-btn" on:click={cancelTranscriptionJob}>Stop</button>
      </div>
    {:else if $reviewSessionStore.transcriptionVersions.length > 0}
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
            <select id="version-select" value={$reviewSessionStore.activeTranscriptionId} on:change={(e) => reviewSessionStore.setActiveTranscriptionId(e.currentTarget.value)}>
              {#each $reviewSessionStore.transcriptionVersions as v}
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

  {#if $reviewSessionStore.transcriptionJob.error}
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
      <span>{$reviewSessionStore.transcriptionJob.error}</span>
    </div>
  {/if}

  <button
    class="transcribe-btn-premium"
    class:secondary-btn={hasVersions}
    on:click={transcribeAudio}
    disabled={$reviewSessionStore.transcriptionJob.running || !hasAudio}
    data-testid="transcribe-btn"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
    <span>{hasVersions ? 'Regenerate Transcription' : 'Start Transcription'}</span>
  </button>
</div>

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

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

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

  .transcribe-btn-premium.secondary-btn {
    background: #ffffff;
    color: #475569;
    border: 1.5px solid #e2e8f0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .transcribe-btn-premium.secondary-btn:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #1e293b;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
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

  .select-wrapper-premium {
    position: relative;
    width: 100%;
  }

  .select-wrapper-premium select {
    width: 100%;
    padding: 0.5rem 0.875rem;
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
    padding: 0.5rem 0.875rem;
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
</style>
