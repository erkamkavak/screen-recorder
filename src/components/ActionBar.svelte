<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import type { Share } from "../stores";
  import DesktopIcon from "./icons/desktop.icon.svelte";
  import ScreenshotIcon from "./icons/screenshot.icon.svelte";
  import ShareButton from "./ShareButton.svelte";
  import WebcamButton from "./WebcamButton.svelte";
  import MicButton from "./ui/MicButton.svelte";
  import CheckIcon from "./icons/check.icon.svelte";
  import CloseIcon from "./icons/close.icon.svelte";
  import newUniqueId from "locally-unique-id-generator";
  import {
    isRecording,
    previewScreenshotCapture,
    recordingDuration,
    screenShareState,
    micState,
    webcamState,
  } from "../stores.js";
  import ActionButton from "./ui/ActionButton.svelte";

  const dispatch = createEventDispatcher();
  let shares:Share[]=[];

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
    $screenShareState.shares.push({ width: 0, height: 0,id:newUniqueId() });
    $screenShareState.shares = $screenShareState.shares;
  };
  $:{
    shares = [...$screenShareState.shares];
  }

  const exportPreviewScreenshot = async () => {
    const capture = $previewScreenshotCapture;
    if (!capture) return;
    const blob = await capture();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "preview-screenshot.png";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 500);
  };
</script>

<div class="flex flex-col gap-5 px-5 py-5 lg:px-6">
  <div class="flex flex-wrap items-start gap-6">
    <div class="flex min-w-[180px] flex-col gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
        Audio & Camera
      </p>
      <div class="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/60">
        <div class="flex flex-col items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <div class="relative h-12 w-12">
            <MicButton />
            {#if $micState.stream}
              <button
                type="button"
                class="group absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/40 dark:hover:bg-emerald-500/20"
                on:click={disableMic}
                aria-label="Turn off mic"
              >
                <span class="block h-3.5 w-3.5 group-hover:hidden">
                  <CheckIcon />
                </span>
                <span class="hidden h-2 w-2 group-hover:block text-red-500">
                  <CloseIcon />
                </span>
              </button>
            {/if}
          </div>
          <span>Mic</span>
          <span class="text-[10px] font-medium uppercase tracking-wide { $micState.stream
            ? 'text-emerald-500 dark:text-emerald-400'
            : 'text-slate-400 dark:text-slate-500'}">
            { $micState.stream ? 'On' : 'Off' }
          </span>
        </div>
        <div class="flex flex-col items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <div class="relative h-12 w-12">
            <WebcamButton />
            {#if $webcamState.stream}
              <button
                type="button"
                class="group absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/40 dark:hover:bg-emerald-500/20"
                on:click={disableWebcam}
                aria-label="Turn off webcam"
              >
                <span class="block h-3.5 w-3.5 group-hover:hidden">
                  <CheckIcon />
                </span>
                <span class="hidden h-2 w-2 group-hover:block text-red-500">
                  <CloseIcon />
                </span>
              </button>
            {/if}
          </div>
          <span>Webcam</span>
          <span class="text-[10px] font-medium uppercase tracking-wide { $webcamState.stream
            ? 'text-emerald-500 dark:text-emerald-400'
            : 'text-slate-400 dark:text-slate-500'}">
            { $webcamState.stream ? 'On' : 'Off' }
          </span>
        </div>
      </div>
    </div>

    <div class="flex min-w-[260px] flex-1 flex-col gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
        Screen Sources
      </p>
      <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/60 px-3 py-3 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/60">
        {#each shares as share, index (share.id)}
          <div class="flex flex-col items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <ShareButton share={share} {index} />
            <span>Share {index + 1}</span>
          </div>
        {/each}
        <div class="flex flex-col items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <div class="h-12 w-12">
            <ActionButton
              on:click={handleAddScreenShare}
              extraClasses="border-dashed border-slate-300/80 text-slate-500 hover:border-slate-400 hover:text-slate-700"
              isSquareVariant
            >
              <div class="w-6 text-slate-500">
                <DesktopIcon />
              </div>
            </ActionButton>
          </div>
          <span>Add</span>
        </div>
      </div>
    </div>

    <div class="flex min-w-[160px] flex-col gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
        Capture
      </p>
      <div class="flex w-full items-center justify-around">
        {#if $recordingDuration !== null}
          <div
            class="min-w-[4.5rem] rounded-full border border-red-200/70 bg-white/90 px-3 py-1 text-center text-sm font-medium text-red-600 shadow-sm transition dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-200"
            transition:fade={{ duration: 300 }}
          >
            {$recordingDuration}
          </div>
        {/if}

        <button
          class="group relative flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200"
          type="button"
          on:click={exportPreviewScreenshot}
          aria-label="Export screenshot"
        >
          <ScreenshotIcon />
          <span class="absolute -bottom-6 text-xs font-medium uppercase tracking-wide text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-300">
            Screenshot
          </span>          
        </button>

        <button
          class="group relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-200 bg-red-500/90 text-white shadow-lg transition hover:bg-red-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-red-500/60 dark:bg-red-500/80 dark:hover:bg-red-500 dark:focus-visible:ring-red-500/70 dark:focus-visible:ring-offset-slate-900"
          on:click={() => {
            dispatch("record");
          }}
          aria-label={$isRecording ? "Stop recording" : "Start recording"}
        >
          <div
            class="transition-all duration-200 ease-out { $isRecording
              ? 'h-4 w-4 rounded-[0.35rem] bg-white/90'
              : 'h-7 w-7 rounded-full bg-white'}"
          />
          <span class="absolute -bottom-6 text-xs font-medium uppercase tracking-wide text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-300">
            {$isRecording ? 'Stop' : 'Record'}
          </span>
        </button>
      </div>
    </div>
  </div>
</div>
