<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import type { Share } from "../lib/stores";
  import DesktopIcon from "./icons/desktop.icon.svelte";
  import ScreenshotIcon from "./icons/screenshot.icon.svelte";
  import ShareButton from "./ShareButton.svelte";
  import WebcamButton from "./WebcamButton.svelte";
  import MicButton from "./ui/MicButton.svelte";
  import CloseIcon from "./icons/close.icon.svelte";
  import newUniqueId from "locally-unique-id-generator";
  import {
    isRecording,
    previewScreenshotCapture,
    recordingDuration,
    screenShareState,
    micState,
    webcamState,
  } from "../lib/stores";
  import ActionButton from "./ui/ActionButton.svelte";

  const dispatch = createEventDispatcher();
  let shares:Share[]=[];
  let isTakingScreenshot = false;

  const disableMic = () => {
    if ($micState.stream) {
      $micState.stream.getTracks().forEach((track) => track.stop());
      $micState.stream = null;
      $micState.deviceId = null;
    }
  };

  const disableWebcam = () => {
    if ($webcamState.stream) {
      $webcamState.stream.getTracks().forEach((track) => track.stop());
      $webcamState.stream = null;
      $webcamState.deviceId = null;
      if ($webcamState.preview) {
        $webcamState.preview.srcObject = null;
      }
    }
  };

  const handleAddScreenShare = () => {
    if ($screenShareState.shares.length >= 1) return;
    $screenShareState.shares.push({ width: 0, height: 0,id:newUniqueId() });
    $screenShareState.shares = $screenShareState.shares;
  };
  $:{
    shares = [...$screenShareState.shares];
  }

  const downloadDataUrl = (dataUrl: string, fileName: string) => {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      anchor.remove();
    }, 200);
  };

  const exportPreviewScreenshot = async () => {
    if (isTakingScreenshot) return;
    isTakingScreenshot = true;
    
    try {
      const capture = $previewScreenshotCapture;
      if (!capture) {
        console.warn("No preview capture available");
        return;
      }      
      const blob = await capture();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      downloadDataUrl(url, "preview-screenshot.png");
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 500);
    } catch (error) {
      console.error("Failed to export screenshot:", error);
    } finally {
      isTakingScreenshot = false;
    }
  };
</script>

<div class="flex items-center gap-6 px-8 py-5 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm dark:bg-slate-900 dark:border-slate-800" data-testid="floating-bar">
  <!-- Audio & Camera Group -->
  <div class="flex items-center gap-4">
    <div class="flex flex-col items-center gap-1.5">
      <div class="relative flex items-center justify-center h-12 w-12">
        <MicButton />
        {#if $micState.stream}
          <button
            type="button"
            class="absolute w-5 -top-2 -right-1.5 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm z-10"
            on:click={disableMic}
            aria-label="Turn off mic"
          >
            <CloseIcon />
          </button>
        {/if}
      </div>
      <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mic</span>
    </div>

    <div class="flex flex-col items-center gap-1.5">
      <div class="relative flex items-center justify-center h-12 w-12">
        <WebcamButton />
        {#if $webcamState.stream}
          <button
            type="button"
            class="absolute w-5 -top-2 -right-1.5 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm z-10"
            on:click={disableWebcam}
            aria-label="Turn off webcam"
          >
            <CloseIcon />
          </button>
        {/if}
      </div>
      <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cam</span>
    </div>
  </div>

  <div class="w-px h-10 bg-slate-200 dark:bg-slate-700 mx-2"></div>

  <!-- Screen Sources Group -->
  <div class="flex items-center gap-4">
    {#each shares as share, index (share.id)}
      <div class="flex flex-col items-center gap-1.5">
        <div class="flex items-center justify-center h-12 w-12" title="Share {index + 1}">
          <ShareButton share={share} {index} />
        </div>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Screen {index + 1}</span>
      </div>
    {/each}
    
    <div class="flex flex-col items-center gap-1.5">
      <div class="h-12 w-12">
        <ActionButton
          on:click={handleAddScreenShare}
          disabled={shares.length >= 1}
          extraClasses="border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:text-slate-500"
          isSquareVariant
        >
          <div class="w-6 text-current">
            <DesktopIcon />
          </div>
        </ActionButton>
      </div>
      <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Add</span>
    </div>
  </div>

  <div class="flex-1"></div>

  <!-- Capture Group -->
  <div class="flex items-center gap-5">
    {#if $recordingDuration !== null}
      <div
        class="px-4 py-1.5 text-base font-medium text-red-600 bg-red-50 border border-red-200 rounded-full dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30"
        transition:fade={{ duration: 200 }}
      >
        {$recordingDuration}
      </div>
    {/if}

    <div class="flex flex-col items-center gap-1.5">
      <button
        class="flex items-center justify-center h-12 w-12 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white disabled:opacity-70 disabled:cursor-not-allowed"
        type="button"
        on:click={exportPreviewScreenshot}
        disabled={isTakingScreenshot}
        title="Take Screenshot"
        aria-label="Export screenshot"
        data-testid="screenshot-btn"
      >
        {#if isTakingScreenshot}
          <svg class="animate-spin h-5 w-5 text-slate-500 dark:text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {:else}
          <div class="w-6 h-6">
            <ScreenshotIcon />
          </div>
        {/if}
      </button>
      <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Snap</span>
    </div>

    <div class="flex flex-col items-center gap-1.5">
      <button
        class="flex items-center gap-3 px-6 py-3 rounded-xl font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all text-base
        { $isRecording 
          ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 focus:ring-red-500 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30 dark:hover:bg-red-900/30' 
          : 'bg-red-600 text-white border border-red-600 hover:bg-red-700 focus:ring-red-500 shadow-red-100 dark:shadow-none' }"
        on:click={() => {
          dispatch("record");
        }}
        aria-label={$isRecording ? "Stop recording" : "Start recording"}
        data-testid="recorder-toggle"
      >
        <div
          class="transition-all duration-200 { $isRecording
            ? 'h-4 w-4 rounded-[3px] bg-current'
            : 'h-4 w-4 rounded-full bg-white'}"
        />
        <span>{$isRecording ? 'Stop' : 'Record'}</span>
      </button>
      <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 invisible">Label</span> <!-- Invisible spacer to align baseline -->
    </div>
  </div>
</div>
