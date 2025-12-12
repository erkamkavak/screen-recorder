<script lang="ts">
  import ActionButton from "./ui/ActionButton.svelte";
  import type { Share } from "../lib/stores";
  import { recordingFPS, screenShareState, isRecording } from "../lib/stores";
  import { onMount } from "svelte";
  import LoadingDots from "./icons/loadingDots.icon.svelte";
  import CloseIcon from "./icons/close.icon.svelte";
  import clsx from "clsx";
  import { clickOutside } from "../lib/utils/clickOutside";
  import { backendAPI } from "../lib/backend/backendAPI";

  type DesktopSourceSummary = {
    id: string;
    name: string;
    thumbnail: string | null;
    type: "screen" | "window";
  };

  export let share: Share;
  export let index: number;
  let preview: HTMLVideoElement;
  let isActive: boolean = false;

  const { isElectron } = backendAPI.getBackendInfo();
  const supportsNativeCapture = isElectron;

  let isPickerVisible = false;
  let isLoadingSources = false;
  let isCapturing = false;
  let desktopSources: DesktopSourceSummary[] = [];
  let pickerError: string | null = null;

  const nativePixelFormat = {
    bgra8: 0,
    rgba8: 1,
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const buildNativeCaptureTarget = (source: DesktopSourceSummary): NativeCaptureTarget => {
    // For XCap, we pass the source ID directly - backendAPI handles the conversion
    if (source.type === "window") {
      return { type: "window", id: source.id };
    } else {
      return { type: "screen", id: source.id };
    }
  };

  const convertNativeFrameToPixels = (
    frame: NativeCaptureFrame,
    width: number,
    height: number
  ): Uint8ClampedArray | null => {
    // Handle both XCap format (pixels) and native_capture format (buffer)
    const buffer = new Uint8ClampedArray(frame.buffer || frame.pixels);
    const expectedLength = width * height * 4;
    if (buffer.length < expectedLength) {
      return null;
    }
    
    // XCap returns RGBA format, native_capture may return BGRA or RGBA
    // Check if format field exists, otherwise assume RGBA (XCap)
    const isRGBA = !frame.format || frame.format === nativePixelFormat.rgba8;
    
    if (isRGBA) {
      return buffer.length === expectedLength ? buffer : buffer.subarray(0, expectedLength);
    }
    
    // Handle BGRA format (native_capture)
    if (frame.format === nativePixelFormat.bgra8) {
      const pixels = new Uint8ClampedArray(expectedLength);
      for (let i = 0; i < expectedLength; i += 4) {
        pixels[i] = buffer[i + 2];
        pixels[i + 1] = buffer[i + 1];
        pixels[i + 2] = buffer[i];
        pixels[i + 3] = buffer[i + 3];
      }
      return pixels;
    }
    return null;
  };

  const createNativeCaptureStream = async ({
    target,
    includeCursor,
    frameRate,
  }: {
    target: NativeCaptureTarget;
    includeCursor: boolean;
    frameRate: number;
  }) => {
    const started = await backendAPI.startNativeCapture({
      target,
      includeCursor,
      frameRate,
    });
    if (!started) {
      throw new Error("Failed to start native capture.");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      backendAPI.stopNativeCapture();
      throw new Error("Unable to initialize capture context.");
    }

    const stream = canvas.captureStream(frameRate || 30);
    let running = true;
    let imageData: ImageData | null = null;

    const stopCapture = () => {
      running = false;
      stream.getTracks().forEach((track) => track.stop());
      backendAPI.stopNativeCapture();
    };

    const renderFrame = (frame: NativeCaptureFrame) => {
      if (frame.width === 0 || frame.height === 0) {
        return false;
      }
      if (
        !imageData ||
        imageData.width !== frame.width ||
        imageData.height !== frame.height
      ) {
        canvas.width = frame.width;
        canvas.height = frame.height;
        imageData = context.createImageData(frame.width, frame.height);
      }

      const pixels = convertNativeFrameToPixels(frame, frame.width, frame.height);
      if (!pixels || !imageData) {
        return false;
      }
      imageData.data.set(pixels);
      context.putImageData(imageData, 0, 0);
      return true;
    };

    const waitForInitialFrame = async () => {
      const deadline = performance.now() + 5000;
      while (running) {
        const frame = (await backendAPI.pollNativeFrame()) as NativeCaptureFrame | null;
        if (!running) {
          break;
        }
        if (!frame) {
          if (performance.now() >= deadline) {
            throw new Error("Timed out waiting for native capture frames");
          }
          await sleep(16);
          continue;
        }
        if (renderFrame(frame)) {
          return;
        }
        if (performance.now() >= deadline) {
          throw new Error("Timed out waiting for native capture frames");
        }
      }
      throw new Error("Native capture interrupted before first frame");
    };

    const pollFrames = async () => {
      while (running) {
        const frame = (await backendAPI.pollNativeFrame()) as NativeCaptureFrame | null;
        if (!running) break;
        if (!frame) {
          await sleep(16);
          continue;
        }
        // console.log("Received frame");
        renderFrame(frame);
      }
    };

    try {
      await waitForInitialFrame();
    } catch (error) {
      stopCapture();
      throw error;
    }

    pollFrames().catch((error) => {
      console.error("Native capture frame loop failed", error);
      stopCapture();
    });

    return { stream, stop: stopCapture };
  };

  const refreshDesktopSources = async () => {
    if (!supportsNativeCapture) {
      pickerError = "Native capture is not supported in this environment.";
      return;
    }
    isLoadingSources = true;
    pickerError = null;

    try {
      const sources = await backendAPI.listDesktopSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 480, height: 270 },
      });
      desktopSources = sources.map((source) => ({
        ...source,
        type: source.type ?? (source.id?.startsWith("screen:") ? "screen" : "window"),
      }));
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

  const convertElectronSourceIdToXcap = (electronId: string, sourceType: "screen" | "window"): string => {
    // Electron uses "screen:0:0" or "window:12345:0" format
    // XCap expects "monitor:0" or "window:12345"
    if (sourceType === "screen") {
      // Extract screen index from "screen:X:Y" -> "monitor:X"
      const parts = electronId.split(":");
      const screenIndex = parts[1] || "0";
      return `monitor:${screenIndex}`;
    } else {
      // For windows, extract window ID from "window:ID:Y" -> "window:ID"
      const parts = electronId.split(":");
      const windowId = parts[1] || "0";
      return `window:${windowId}`;
    }
  };

  const startNativeCapture = async (source: DesktopSourceSummary) => {
    if (!supportsNativeCapture) {
      throw new Error("Native capture is not supported in this environment.");
    }
    
    // Native sources from xcap already use the correct format (monitor:X, window:X)
    // Only convert if it's an old Electron format (screen:X:Y)
    if (source.id.startsWith("screen:") && source.id.split(":").length > 2) {
      share.id = convertElectronSourceIdToXcap(source.id, source.type);
    } else {
      share.id = source.id;
    }
    
    const target = buildNativeCaptureTarget(source);

    console.log("Starting native capture with target:", target);
    const { stream, stop } = await createNativeCaptureStream({
      target,
      includeCursor: false,
      frameRate: $recordingFPS || 30,
    });

    console.log("Native capture stream started:", stream);
    console.log("Native capture stop function:", stop);
    share.stopNativeCapture = stop;
    share.stream = stream;
  };

  const startStreamFromSource = async (source: DesktopSourceSummary) => {
    share.stopNativeCapture?.();
    share.stopNativeCapture = undefined;

    try {
      isCapturing = true;
      await startNativeCapture(source);
      share.preview.srcObject = share.stream;
      // Trigger Svelte reactivity by updating the store
      $screenShareState.shares = $screenShareState.shares;
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

  const cancelSelection = () => {
    // Only remove if no stream has been started yet
    if (!share.stream) {
      removeShare(index);
    } else {
      // Just close the picker if we already have a stream
      isPickerVisible = false;
    }
  };

  const selectSource = async (source: DesktopSourceSummary) => {
    await startStreamFromSource(source);
    if (share.stream) {
      pickerError = null;
    }
  };

  onMount(async () => {
    if (!share?.stream) {
      isPickerVisible = true;
      await refreshDesktopSources();
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
      $screenShareState.shares[index].stopNativeCapture?.();
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
    // Set the preview video srcObject when stream is available
    if (preview && $screenShareState.shares[index]?.stream) {
      preview.srcObject = $screenShareState.shares[index].stream;
    }
    // Also handle the case where share.stream is set directly
    if (preview && share.stream && !preview.srcObject) {
      preview.srcObject = share.stream;
    }
    isActive = $screenShareState.activeIndex === index;
  }

  $: if (share.preview && share.stream && !share.preview.srcObject) {
    share.preview.srcObject = share.stream;
  }
  $: if (share.stream) {
    isPickerVisible = false;
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
    {#if isPickerVisible}
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
                  on:click={() => selectSource(source)}
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
