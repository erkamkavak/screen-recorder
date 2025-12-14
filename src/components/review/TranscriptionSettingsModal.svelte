<script lang="ts">
  export let open = false;
  export let transcriptionProviders: string[] = [];
  export let provider = "soniox";
  export let apiBaseUrl = "https://api.soniox.com";
  export let apiKey = "";

  export let onClose: () => void = () => {};
  export let onSave: () => void = () => {};

  const close = () => {
    onClose();
  };

  const save = () => {
    onSave();
  };
</script>

{#if open}
  <button type="button" class="modal-backdrop" on:click={close} />
  <div class="modal" role="dialog" aria-modal="true">
    <h2>Transcription</h2>
    <div class="format-field">
      <label class="field-label" for="transcription-provider">Provider</label>
      <div class="select-wrapper">
        <select id="transcription-provider" bind:value={provider}>
          {#if transcriptionProviders.length}
            {#each transcriptionProviders as p}
              <option value={p}>{p}</option>
            {/each}
          {:else}
            <option value={provider}>{provider}</option>
          {/if}
        </select>
      </div>
    </div>
    <div class="format-field">
      <label class="field-label" for="transcription-api-base">API base URL</label>
      <input id="transcription-api-base" class="text-input" bind:value={apiBaseUrl} />
    </div>
    <div class="format-field">
      <label class="field-label" for="transcription-api-key">API key</label>
      <input id="transcription-api-key" class="text-input" type="password" bind:value={apiKey} />
    </div>
    <div class="button-stack">
      <button class="primary" on:click={save}>Save</button>
      <button class="secondary" on:click={close}>Close</button>
    </div>
  </div>
{/if}
