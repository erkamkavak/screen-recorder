<script lang="ts">
  import ActionButton from "./ui/ActionButton.svelte";
  import type { Share } from "../stores";
  import { screenShareState } from "../stores.js";
  import { onMount } from "svelte";
  import LoadingDots from "./icons/loadingDots.icon.svelte";
  import CloseIcon from "./icons/close.icon.svelte";
  import clsx from "clsx";
  import { clickOutside } from "../directives/clickOutside";

  type DesktopSourceSummary = {
    id: string;
    name: string;
    thumbnail: string | null;
  };

  export let share: Share;
  export let index: number;
  let preview: HTMLVideoElement;
  let isActive: boolean = false;

  const isElectron = typeof window !== "undefined" && "electronAPI" in window;

  let isPickerVisible = false;
  let isLoadingSources = false;
  let isCapturing = false;
  let desktopSources: DesktopSourceSummary[] = [];
  let pickerError: string | null = null;

  const refreshDesktopSources = async () => {
    if (!isElectron || typeof window.electronAPI?.listDesktopSources !== "function") return;

    isLoadingSources = true;
    pickerError = null;

    try {
      desktopSources = await window.electronAPI.listDesktopSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 480, height: 270 },
      });
      if (!desktopSources.length) {
        pickerError = "No capture sources found.";
      }
    } catch (error) {
      console.error("Failed to list desktop capture sources", error);
      pickerError = (error as Error)?.message ?? "Unable to list capture sources.";
      desktopSources = [];
    } finally {
      isLoadingSources = false;
    }
  };

  const startStreamFromSource = async (sourceId: string) => {
    if (!isElectron || typeof window.electronAPI?.getDesktopSourceId !== "function") return;

    try {
      isCapturing = true;
      const resolvedSourceId = await window.electronAPI.getDesktopSourceId({
        preferredId: sourceId,
      });
      if (!resolvedSourceId) {
        throw new Error("Selected source is no longer available.");
      }

      const videoConstraints: any = {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: resolvedSourceId,
          cursor: "never",
        },
        optional: [{ cursor: "never" }],
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
      const cursorTrack = stream.getVideoTracks()[0];
      if (cursorTrack?.applyConstraints) {
        try {
          await cursorTrack.applyConstraints({ advanced: [{ cursor: "never" }] } as any);
        } catch {
          // ignore unsupported constraints
        }
      }

      share.stream = stream;
      share.preview.srcObject = share.stream;
      grabDimensions();
      makeActive();
      isPickerVisible = false;
    } catch (error) {
      console.error("Failed to start screen capture", error);
      pickerError = (error as Error)?.message ?? "Failed to start capture.";
    } finally {
      isCapturing = false;
    }
  };

  const startBrowserCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "never" } as any,
      });
      share.stream = stream;
      share.preview.srcObject = share.stream;
      grabDimensions();
      makeActive();
    } catch (error) {
      console.error("Failed to start screen capture", error);
      removeShare(index);
    }
  };

  const cancelSelection = () => {
    removeShare(index);
  };

  const selectSource = async (sourceId: string) => {
    await startStreamFromSource(sourceId);
    if (share.stream) {
      pickerError = null;
    }
  };

  onMount(async () => {
    if (isElectron) {
      isPickerVisible = true;
      await refreshDesktopSources();
    } else {
      await startBrowserCapture();
    }
  });

  const removeShare = async (removingItemIndex) => {
    const filteredShares = $screenShareState.shares.filter(
      (item, i) => i !== removingItemIndex
    );
    let newActiveIndex = null;
    if (
      removingItemIndex === $screenShareState.activeIndex &&
      filteredShares.length &&
      removingItemIndex === 0
    ) {
      newActiveIndex = 0;
    }

    if (
      removingItemIndex === $screenShareState.activeIndex &&
      filteredShares.length &&
      removingItemIndex !== 0
    ) {
      newActiveIndex = removingItemIndex - 1;
    }
    if (
      removingItemIndex !== $screenShareState.activeIndex &&
      filteredShares.length &&
      removingItemIndex > $screenShareState.activeIndex
    ) {
      newActiveIndex = $screenShareState.activeIndex;
    }
    if (
      removingItemIndex !== $screenShareState.activeIndex &&
      filteredShares.length &&
      removingItemIndex < $screenShareState.activeIndex
    ) {
      newActiveIndex = $screenShareState.activeIndex - 1;
    }
    $screenShareState = { activeIndex: newActiveIndex, shares: filteredShares };
  };

  const stopSharing = (event, index) => {
    if ($screenShareState.shares[index]) {
      $screenShareState.shares[index].stream
        .getTracks()
        .forEach((track) => track.stop());
      $screenShareState.shares = $screenShareState.shares;
      removeShare(index);
    }
  };

  const grabDimensions = () => {
    const { videoWidth, videoHeight } = share.preview;
    share.width = videoWidth;
    share.height = videoHeight;
  };

  const makeActive = () => {
    const shareIndex = $screenShareState.shares.indexOf(share);
    $screenShareState.activeIndex = shareIndex;
    setTimeout(() => {
      $screenShareState.shares[shareIndex].width = share.preview.videoWidth;
      $screenShareState.shares[shareIndex].height = share.preview.videoHeight;
    }, 100);
  };

  $: {
    if (preview && $screenShareState.shares[index]) {
      preview.srcObject = $screenShareState.shares[index].stream;
    }
    isActive = $screenShareState.activeIndex === index;
  }
</script>

<div class="w-20 h-14 relative">
  <ActionButton {isActive} isSquareVariant on:click={makeActive}>
    <video
      class="invisible absolute top-0 left-0"
      bind:this={share.preview}
      autoplay
      playsinline
      muted
      on:resize={grabDimensions}
    />
    {#if isElectron && isPickerVisible}
      <div
        class="absolute bottom-full left-1/2 z-40 -translate-x-1/2 mb-3"
        use:clickOutside
        on:outclick={cancelSelection}
      >
        <div
          class="w-[28rem] max-h-96 flex flex-col gap-4 p-5 bg-white dark:bg-fmd-navy/95 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-fmd-blue/60"
        >
          {#if isLoadingSources || isCapturing}
            <div class="flex flex-1 flex-col items-center justify-center gap-3 py-6">
              <LoadingDots />
              <p class="text-xs font-medium text-gray-600 dark:text-fmd-white/80">
                Loading available screens and windows...
              </p>
            </div>
          {:else if pickerError}
          <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center px-2 py-4">
            <p class="text-sm text-fmd-gray dark:text-fmd-white">{pickerError}</p>
            <div class="flex gap-2">
              <button class="px-3 py-1 rounded border border-fmd-gray text-sm" on:click={refreshDesktopSources}>
                Retry
              </button>
              <button class="px-3 py-1 rounded border border-fmd-gray text-sm" on:click={cancelSelection}>
                Cancel
              </button>
            </div>
          </div>
        {:else if desktopSources.length === 0}
          <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center px-4 py-6 text-sm text-gray-600 dark:text-fmd-white">
            <p>No windows or screens were detected.</p>
            <p class="text-xs opacity-70">Try opening a window you want to record or use Refresh.</p>
            <div class="flex gap-2">
              <button class="px-3 py-1 rounded border border-fmd-gray text-sm" on:click={refreshDesktopSources}>
                Refresh
              </button>
              <button class="px-3 py-1 rounded border border-fmd-gray text-sm" on:click={cancelSelection}>
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <div class="flex-1 overflow-auto pr-1">
            <div class="grid gap-4 grid-cols-2">
              {#each desktopSources as source (source.id)}
                <button
                  class="flex flex-col items-center gap-3 p-4 rounded-xl border border-transparent hover:border-fmd-red transition bg-white/90 dark:bg-fmd-navy/70 hover:bg-fmd-red/5 dark:hover:bg-fmd-blue/20"
                  on:click={() => selectSource(source.id)}
                >
                  {#if source.thumbnail}
                    <img src={source.thumbnail} alt={source.name} class="w-32 h-20 object-cover rounded-lg shadow-md" />
                  {:else}
                    <div class="w-32 h-20 bg-gray-200 rounded-lg" />
                  {/if}
                  <span class="text-xs text-gray-700 dark:text-white font-medium text-center leading-tight break-words w-full">
                    {source.name}
                  </span>
                </button>
              {/each}
            </div>
          </div>
          <div class="flex justify-between pt-1 text-xs">
            <button class="px-3 py-1 border border-fmd-gray rounded" on:click={refreshDesktopSources}>
              Refresh
            </button>
            <button class="px-3 py-1 border border-fmd-gray rounded" on:click={cancelSelection}>
              Cancel
            </button>
          </div>
        {/if}
        </div>
      </div>
    {:else if share.stream}
      <video class="h-full" autoplay playsinline muted bind:this={preview} />
      <button
        on:click={(event) => stopSharing(event, index)}
        class="absolute w-5 -top-2 -right-1.5 p-1.5 rounded-full bg-fmd-red text-white hover:bg-fmd-red-600 transition-default"
      >
        <CloseIcon />
      </button>
    {:else}
      <LoadingDots />
    {/if}
    <div
      class={clsx(
        "w-1.5 h-1.5 bg-fmd-red rounded-full absolute left-0 right-0 m-auto -bottom-3",
        isActive ? "block" : "hidden group-hover:block"
      )}
    />
  </ActionButton>
</div>
