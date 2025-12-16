<script lang="ts">
  import { onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { notesStore } from "../../../lib/stores/notes";
  import { isRecording } from "../../../lib/stores";
  import { backendAPI } from "../../../lib/backend/backendAPI";

  const { notes, noteCount, settings, resetForRecording } = notesStore;

  const { isElectron } = backendAPI.getBackendInfo();

  let wasRecording = false;

  const sendNotesToElectron = () => {
    if (!isElectron) return;
    
    const notesArray = get(notes);
    const currentSettings = get(settings);
    backendAPI.updateNotesOverlay({
      notes: notesArray,
      recording: true,
      visible: true,
      autoHide: currentSettings.autoHide,
      autoHideDelay: currentSettings.autoHideDelay,
      shortcuts: currentSettings.shortcuts,
    });
  };

  $: if ($isRecording && !wasRecording) {
    wasRecording = true;
    resetForRecording();
    if ($noteCount > 0 && isElectron) {
      sendNotesToElectron();
      backendAPI.startNotesShortcuts();
      backendAPI.showNotesOverlay();
    }
  }

  $: if (!$isRecording && wasRecording) {
    wasRecording = false;
    if (isElectron) {
      backendAPI.stopNotesShortcuts();
      backendAPI.hideNotesOverlay();
    }
  }

  onDestroy(() => {
    if (isElectron) {
      backendAPI.stopNotesShortcuts();
      backendAPI.destroyNotesOverlay();
    }
  });
</script>