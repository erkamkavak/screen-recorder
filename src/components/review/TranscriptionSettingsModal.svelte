<script lang="ts">
  import { onMount } from "svelte";
  import { fade, scale } from "svelte/transition";
  import {
    backendAPI,
    type TranscriptionModelInfo,
  } from "../../lib/backend/backendAPI";

  export let open = false;
  export let transcriptionProviders: string[] = [];
  export let provider = "soniox";
  export let apiBaseUrl = "https://api.soniox.com";
  export let apiKey = "";
  export let selectedModel = "";

  export let onClose: () => void = () => {};
  export let onSave: () => void = () => {};

  let models: TranscriptionModelInfo[] = [];
  let loadingModels = false;

  const isLocalProvider = (p: string) => {
    const lp = p?.toLowerCase();
    return ["whisper", "parakeet", "local"].includes(lp);
  };
  const isCloudProvider = (p: string) => p?.toLowerCase() === "soniox";

  $: filteredModels = models.filter((m) => {
    const p = provider?.toLowerCase();
    const engineType = m.engineType?.toLowerCase();

    if (p === "whisper") return engineType === "whisper";
    if (p === "parakeet") return engineType === "parakeet";
    if (p === "local") return true;
    return false;
  });

  $: if (open && isLocalProvider(provider)) {
    loadModels();
  }

  // Handle model selection when provider changes
  $: {
    if (provider) {
      if (isCloudProvider(provider)) {
        // Cloud providers currently don't use the local model list
        selectedModel = "";
      } else if (isLocalProvider(provider)) {
        // When switching between local providers, check if current model is still valid
        const isCompatible = filteredModels.some((m) => m.id === selectedModel);
        if (!isCompatible) {
          const downloaded = filteredModels.find((m) => m.isDownloaded);
          if (downloaded) {
            selectedModel = downloaded.id;
          } else {
            selectedModel = "";
          }
        }
      }
    }
  }

  const loadModels = async () => {
    loadingModels = true;
    try {
      models = await backendAPI.listTranscriptionModels();
      if (!selectedModel && filteredModels.length > 0) {
        const downloaded = filteredModels.find((m) => m.isDownloaded);
        if (downloaded) {
          selectedModel = downloaded.id;
        }
      }
    } catch (e) {
      console.error("Failed to load models:", e);
    } finally {
      loadingModels = false;
    }
  };

  const downloadModel = async (modelId: string) => {
    try {
      await backendAPI.downloadTranscriptionModel(modelId);
      pollModelStatus(modelId);
    } catch (e) {
      console.error("Failed to start download:", e);
    }
  };

  const cancelModelDownload = async (modelId: string) => {
    try {
      await backendAPI.cancelTranscriptionModelDownload(modelId);
      models = await backendAPI.listTranscriptionModels();
    } catch (e) {
      console.error("Failed to cancel download:", e);
    }
  };

  const pollModelStatus = async (modelId: string) => {
    const poll = async () => {
      await backendAPI.refreshTranscriptionModelStatus();
      models = await backendAPI.listTranscriptionModels();
      const model = models.find((m) => m.id === modelId);
      if (model?.isDownloading) {
        setTimeout(poll, 1000);
      }
    };
    poll();
  };

  const deleteModel = async (modelId: string) => {
    try {
      await backendAPI.deleteTranscriptionModel(modelId);
      models = await backendAPI.listTranscriptionModels();
      if (selectedModel === modelId) {
        selectedModel = "";
      }
    } catch (e) {
      console.error("Failed to delete model:", e);
    }
  };

  const close = () => {
    onClose();
  };

  const save = () => {
    onSave();
  };

  $: isSelectedModelReady = (() => {
    if (isCloudProvider(provider)) return true;
    const model = models.find((m) => m.id === selectedModel);
    return model?.isDownloaded && !model?.isDownloading;
  })();

  const formatSize = (mb: number) => {
    if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
    return `${mb} MB`;
  };

  const getProviderLabel = (p: string) => {
    const labels: Record<string, string> = {
      soniox: "Soniox",
      whisper: "Whisper",
      parakeet: "Parakeet",
      local: "Auto",
      noop: "No-op",
    };
    return labels[p] || p;
  };

  const getProviderDescription = (p: string) => {
    const descriptions: Record<string, string> = {
      soniox: "Cloud-based, industry leading accuracy",
      whisper: "Standard local model, high quality",
      parakeet: "Fast local model by NVIDIA",
      local: "Best local model for your device",
    };
    return descriptions[p] || "";
  };
</script>

{#if open}
  <div
    class="modal-backdrop"
    transition:fade={{ duration: 200 }}
    on:click={close}
    on:keydown={() => {}}
    role="button"
    tabindex="-1"
  />
  <div class="modal-wrapper" transition:scale={{ duration: 200, start: 0.98 }}>
    <div class="modal-content" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="header-content">
          <div class="header-icon-small">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
          <div class="header-text">
            <h2>Transcription</h2>
            <p>Configure audio processing and captioning</p>
          </div>
        </div>
        <button class="close-btn" on:click={close} aria-label="Close">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="section">
          <span class="section-label">Select Provider</span>
          <div class="provider-list">
            {#each transcriptionProviders.filter((p) => p !== "noop" && p !== "local") as p}
              <button
                class="provider-item"
                class:selected={provider?.toLowerCase() === p?.toLowerCase()}
                on:click={() => (provider = p)}
              >
                <div class="provider-radio">
                  <div class="radio-circle" />
                </div>
                <div class="provider-info">
                  <span class="provider-name">{getProviderLabel(p)}</span>
                  <span class="provider-desc">{getProviderDescription(p)}</span>
                </div>
                {#if isCloudProvider(p)}
                  <span class="badge cloud">Cloud</span>
                {:else}
                  <span class="badge local">Local</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        {#if isCloudProvider(provider)}
          <div class="config-section" transition:fade={{ duration: 150 }}>
            <div class="input-group">
              <label for="transcription-api-base">API Endpoint</label>
              <input
                id="transcription-api-base"
                type="url"
                bind:value={apiBaseUrl}
                placeholder="https://api.soniox.com"
              />
            </div>
            <div class="input-group">
              <label for="transcription-api-key">API Key</label>
              <input
                id="transcription-api-key"
                type="password"
                bind:value={apiKey}
                placeholder="Ente your API key"
              />
              <p class="hint">Your key is stored securely on your device.</p>
            </div>
          </div>
        {/if}

        {#if isLocalProvider(provider)}
          <div class="config-section" transition:fade={{ duration: 150 }}>
            <div class="section-header">
              <span class="section-label">Available Models</span>
              {#if loadingModels}
                <div class="loading-spinner" />
              {/if}
            </div>

            {#if !loadingModels && filteredModels.length === 0}
              <div class="empty-state">
                <p>No compatible models found for this provider.</p>
              </div>
            {:else if !loadingModels}
              <div class="models-grid">
                {#each filteredModels as model}
                  {@const progress = Math.min(
                    100,
                    Math.round(
                      (model.partialSize / (model.sizeMb * 1024 * 1024)) * 100
                    )
                  )}
                  <div
                    class="model-item"
                    class:selected={selectedModel === model.id}
                  >
                    <button
                      class="model-main-btn"
                      disabled={!model.isDownloaded}
                      on:click={() => (selectedModel = model.id)}
                    >
                      <div class="model-row">
                        <span class="model-name">{model.name}</span>
                        <span class="model-size-badge"
                          >{formatSize(model.sizeMb)}</span
                        >
                        {#if model.isDownloaded}
                          <span class="badge-mini ready">Ready</span>
                        {/if}
                      </div>

                      <p class="model-tagline">{model.description}</p>

                      <div class="model-metrics">
                        <div class="metric">
                          <span class="metric-label">Accuracy</span>
                          <div class="metric-bar-bg">
                            <div
                              class="metric-bar-fill accuracy"
                              style="width: {model.accuracyScore * 100}%"
                            />
                          </div>
                        </div>
                        <div class="metric">
                          <span class="metric-label">Speed</span>
                          <div class="metric-bar-bg">
                            <div
                              class="metric-bar-fill speed"
                              style="width: {model.speedScore * 100}%"
                            />
                          </div>
                        </div>
                      </div>
                    </button>

                    <div class="model-actions">
                      {#if model.isDownloading}
                        <div class="download-progress-container">
                          <div class="progress-ring-box">
                            <svg class="progress-ring" width="32" height="32">
                              <circle class="ring-bg" cx="16" cy="16" r="14" />
                              <circle
                                class="ring-fill"
                                cx="16"
                                cy="16"
                                r="14"
                                style="stroke-dasharray: {2 *
                                  Math.PI *
                                  14}; stroke-dashoffset: {2 *
                                  Math.PI *
                                  14 *
                                  (1 - progress / 100)}"
                              />
                            </svg>
                            <span class="progress-text">{progress}%</span>
                          </div>
                          <button
                            class="small-cancel-link"
                            on:click={() => cancelModelDownload(model.id)}
                            >Cancel</button
                          >
                        </div>
                      {:else if model.isDownloaded}
                        <button
                          class="icon-action-btn delete"
                          on:click={() => deleteModel(model.id)}
                          title="Delete model"
                        >
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
                            <path
                              d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"
                            />
                          </svg>
                        </button>
                      {:else}
                        <button
                          class="icon-action-btn download"
                          on:click={() => downloadModel(model.id)}
                          title="Download model"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 15 15"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fill-rule="evenodd"
                              clip-rule="evenodd"
                              d="M7.50005 1.04999C7.74858 1.04999 7.95005 1.25146 7.95005 1.49999V8.41359L10.1819 6.18179C10.3576 6.00605 10.6425 6.00605 10.8182 6.18179C10.994 6.35753 10.994 6.64245 10.8182 6.81819L7.81825 9.81819C7.64251 9.99392 7.35759 9.99392 7.18185 9.81819L4.18185 6.81819C4.00611 6.64245 4.00611 6.35753 4.18185 6.18179C4.35759 6.00605 4.64251 6.00605 4.81825 6.18179L7.05005 8.41359V1.49999C7.05005 1.25146 7.25152 1.04999 7.50005 1.04999ZM2.5 10C2.77614 10 3 10.2239 3 10.5V12C3 12.5539 3.44565 13 3.99635 13H11.0012C11.5529 13 12 12.5528 12 12V10.5C12 10.2239 12.2239 10 12.5 10C12.7761 10 13 10.2239 13 10.5V12C13 13.1041 12.1062 14 11.0012 14H3.99635C2.89019 14 2 13.103 2 12V10.5C2 10.2239 2.22386 10 2.5 10Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" on:click={close}>Discard</button>
        <button
          class="save-btn"
          on:click={save}
          disabled={!isSelectedModelReady}
        >
          {isCloudProvider(provider) ? "Save Settings" : "Apply Settings"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.3);
    backdrop-filter: blur(12px);
    z-index: 1000;
  }

  .modal-wrapper {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    width: 100%;
    max-width: 460px;
    padding: 1rem;
  }

  .modal-content {
    background: #ffffff;
    border-radius: 28px;
    box-shadow: 0 32px 64px -12px rgba(0, 0, 0, 0.14),
      0 0 0 1px rgba(0, 0, 0, 0.04);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 85vh;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.5rem 1rem;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .header-icon-small {
    width: 36px;
    height: 36px;
    background: #f1f5f9;
    color: #475569;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-text h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
  }

  .header-text p {
    margin: 0;
    font-size: 0.8125rem;
    color: #64748b;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .modal-body {
    padding: 0 1.5rem 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .provider-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 1rem;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: left;
    width: 100%;
  }

  .provider-item:hover {
    background: #f1f5f9;
    border-color: #e2e8f0;
  }

  .provider-item.selected {
    background: #ffffff;
    border-color: #3b82f6;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.08);
  }

  .provider-radio {
    width: 18px;
    height: 18px;
    border: 2px solid #e2e8f0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .provider-item.selected .provider-radio {
    border-color: #3b82f6;
  }

  .radio-circle {
    width: 8px;
    height: 8px;
    background: #3b82f6;
    border-radius: 50%;
    opacity: 0;
    transform: scale(0.5);
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .provider-item.selected .radio-circle {
    opacity: 1;
    transform: scale(1);
  }

  .provider-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .provider-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #1e293b;
  }

  .provider-desc {
    font-size: 0.75rem;
    color: #64748b;
  }

  .badge {
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .badge.cloud {
    background: #eff6ff;
    color: #3b82f6;
  }

  .badge.local {
    background: #f0fdf4;
    color: #16a34a;
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding-top: 0.5rem;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #475569;
  }

  .input-group input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    font-size: 0.9375rem;
    color: #0f172a;
    transition: all 0.2s;
  }

  .input-group input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  }

  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .loading-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #e2e8f0;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .models-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .model-item {
    display: flex;
    align-items: stretch;
    background: #ffffff;
    border: 1px solid #f1f5f9;
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .model-item:hover:not(.inactive) {
    border-color: #e2e8f0;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .model-item.selected {
    border-color: #3b82f6;
    box-shadow: 0 8px 20px -8px rgba(59, 130, 246, 0.15);
  }

  .model-main-btn {
    flex: 1;
    width: 0;
    padding: 1rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .model-main-btn:disabled {
    cursor: default;
  }

  .model-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .model-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: #1e293b;
  }

  .model-size-badge {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #64748b;
    background: #f1f5f9;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .badge-mini {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .badge-mini.ready {
    background: #f0fdf4;
    color: #16a34a;
  }

  .model-tagline {
    margin: 0;
    font-size: 0.8125rem;
    color: #64748b;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
    height: 2.3em; /* Fixed height for 2 lines to ensure consistency */
  }

  .model-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    width: 100%;
    margin-top: 0.5rem;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .metric-label {
    font-size: 0.625rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .metric-bar-bg {
    height: 4px;
    background: #f1f5f9;
    border-radius: 999px;
    overflow: hidden;
    width: 100%;
  }

  .metric-bar-fill {
    height: 100%;
    border-radius: 999px;
  }

  .metric-bar-fill.accuracy {
    background: #3b82f6;
  }
  .metric-bar-fill.speed {
    background: #10b981;
  }

  .model-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 80px;
    padding: 0 0.5rem;
    background: #f8fafc;
    border-left: 1px solid #f1f5f9;
  }

  .download-progress-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .progress-ring-box {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .progress-ring {
    transform: rotate(-90deg);
  }

  .ring-bg {
    fill: none;
    stroke: #e2e8f0;
    stroke-width: 3;
  }

  .ring-fill {
    fill: none;
    stroke: #3b82f6;
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s ease;
  }

  .progress-text {
    position: absolute;
    font-size: 0.625rem;
    font-weight: 700;
    color: #3b82f6;
  }

  .small-cancel-link {
    font-size: 0.625rem;
    color: #ef4444;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-weight: 600;
  }

  .small-cancel-link:hover {
    text-decoration: underline;
  }

  .icon-action-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .icon-action-btn.delete {
    color: #ef4444;
    background: transparent;
  }
  .icon-action-btn.delete:hover {
    background: #fee2e2;
  }

  .icon-action-btn.download {
    color: #3b82f6;
    background: transparent;
  }
  .icon-action-btn.download:hover {
    background: #eff6ff;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .empty-state {
    padding: 2.5rem 1rem;
    text-align: center;
    background: #f8fafc;
    border-radius: 20px;
    border: 1px dashed #e2e8f0;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
    color: #94a3b8;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.5rem 1.5rem;
    border-top: 1px solid #f1f5f9;
  }

  .cancel-btn,
  .save-btn {
    flex: 1;
    padding: 0.875rem;
    border-radius: 14px;
    font-size: 0.9375rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border: none;
  }

  .cancel-btn {
    background: #f1f5f9;
    color: #475569;
  }

  .cancel-btn:hover {
    background: #e2e8f0;
    color: #0f172a;
  }

  .save-btn {
    background: #0f172a;
    color: #ffffff;
  }

  .save-btn:hover {
    background: #1e293b;
    transform: translateY(-1px);
    box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.1);
  }

  .save-btn:active {
    transform: translateY(0);
  }
</style>
