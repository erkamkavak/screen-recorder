<script lang="ts">
  import PointerStyleControls from "./PointerStyleControls.svelte";
  import TranscriptionSettingsModal from "./TranscriptionSettingsModal.svelte";
  import type { PointerEventRecord } from "../../lib/stores";
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

</script>

<aside class="review-aside" style={`width: ${asideWidthPx}px;`}>
  <h1>Render options</h1>
  <p class="aside-text">Control the render, then download it as a video file.</p>

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

  <div class="button-stack">
    <button class="secondary" on:click={openTranscriptionSettings} disabled={!hasAudio}>
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
    <p class="aside-text">{$transcriptionJob.error}</p>
  {/if}

  <TranscriptionSettingsModal
    open={showTranscriptionSettings}
    {transcriptionProviders}
    bind:provider={settingsProvider}
    bind:apiBaseUrl={settingsApiBaseUrl}
    bind:apiKey={settingsApiKey}
    onClose={closeTranscriptionSettings}
    onSave={saveTranscriptionSettings}
  />

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

  <PointerStyleControls
    {pointerIconOptions}
    {zipPointerImportMessage}
    {onZipPointerFileChange}
  />

  <div class="button-stack">
    <button class="primary" on:click={onRender} disabled={isRenderingVideo}>
      {#if isRenderingVideo}
        Rendering… {renderProgress}%
      {:else}
        Render and download
      {/if}
    </button>
    {#if isRenderingVideo}
      <button class="danger" on:click={onCancelRender}>
        Cancel render
      </button>
    {/if}
    <button class="secondary" on:click={resetToRecorder}>Back to recorder</button>
  </div>

  <dl class="stats">
    <div>
      <dt>Duration</dt>
      <dd>{humanDuration(Math.round(videoDuration))}</dd>
    </div>
  </dl>
</aside>

<style>
  .review-aside {
    flex: 0 0 auto;
    min-width: 20rem;
    border-radius: 18px;
    border: 1px solid #e5e7eb;
    padding: 1.5rem;
    background: #fff;
    box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: sticky;
    top: 1.5rem;
    align-self: flex-start;
  }

  .review-aside h1 {
    margin: 0;
    font-size: 1.35rem;
  }

  @media (max-width: 1024px) {
    .review-aside {
      position: static;
      width: auto !important;
      flex: 1 1 auto;
      margin-right: 0;
    }
  }
</style>
