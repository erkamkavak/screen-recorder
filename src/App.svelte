<script lang="ts">
  import Preview from "./components/Preview.svelte";
  import {
    appView,
    displayStream,
    inputEvents,
    isRecording,
    lastRecording,
    micState,
    mouseCursorStream,
    recordingStartTime,
    recordingFPS,
    webcamState,
    activeShare,
    type RecordingAssetType,
    type RecordingAssets,
    type LastRecording,
  } from "./stores";
  import ActionBar from "./components/ActionBar.svelte";
  import ReviewView from "./components/ReviewView.svelte";
  import RecorderSidebar from "./components/RecorderSidebar.svelte";
  import { patchBlob } from "./utils/blobHelpers";
  import { getPreferredMimeType } from "./utils/getPreferredMimeType";
  import { backendAPI } from "./utils/backendAPI";

  type AssetChunk = {
    type: RecordingAssetType;
    blob: Blob;
    fileName: string;
  };

  type AssetRecorderState = {
    type: RecordingAssetType;
    recorder: MediaRecorder;
    stream: MediaStream;
    promise: Promise<AssetChunk>;
  };

  let currentAssetRecorders: AssetRecorderState[] = [];
  let recordingFileExtension = "webm";
  let nativeRecordingFilePath: string | null = null;
  const canUseMediaRecorder = typeof MediaRecorder !== "undefined";

  const saveAssetToStorage = async (blob: Blob, fileName: string): Promise<string> => {
    try {
      const buffer = await blob.arrayBuffer();
      return await backendAPI.saveRecordingAsset(fileName, buffer);
    } catch {
      return URL.createObjectURL(blob);
    }
  };

  const cleanupAssetPaths = async (paths: string[]) => {
    if (!paths.length) return;
    try {
      await backendAPI.cleanupRecordingAssets(paths);
    } catch {
      // Silently fail for browser fallback
    }
  };

  const revokeRecordingAssets = async (recording: LastRecording | null) => {
    if (!recording) return;
    const objectUrls: string[] = [];
    const filePaths: string[] = [];
    Object.values(recording.assets).forEach((asset) => {
      if (!asset) return;
      if (asset.filePath.startsWith("blob:")) {
        objectUrls.push(asset.filePath);
      } else {
        filePaths.push(asset.filePath);
      }
    });
    objectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    await cleanupAssetPaths(filePaths);
  };

  const cloneStream = (stream: MediaStream) => {
    const cloned = new MediaStream();
    stream.getTracks().forEach((track) => {
      cloned.addTrack(track.clone());
    });
    return cloned;
  };

  const createAssetRecorder = (
    type: RecordingAssetType,
    stream: MediaStream,
    options: MediaRecorderOptions,
    fileName: string
  ): AssetRecorderState | null => {
    if (!canUseMediaRecorder) {
      return null;
    }
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(stream, options);
    } catch (error) {
      console.warn(`Unable to record ${type}`, error);
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }

    const promise = new Promise<AssetChunk>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        reject((event as any).error ?? new Error("MediaRecorder failed"));
      };

      recorder.onstop = () => {
        const blobType = chunks[0]?.type || options.mimeType;
        const blob = new Blob(chunks, { type: blobType });
        resolve({ type, blob, fileName });
      };
    });

    recorder.start();
    return { type, recorder, stream, promise };
  };

  const finalizeRecordingAssets = async (
    durationMs: number,
    recorders: AssetRecorderState[],
    fileExtension: string
  ) => {
    const assets: RecordingAssets = {};

    try {
      // Process MediaRecorder assets (webcam, mouse, audio)
      if (recorders.length) {
        const assetChunks = await Promise.all(recorders.map(({ promise }) => promise));
        for (const chunk of assetChunks) {
          const patchedBlob = await patchBlob(chunk.blob, durationMs);
          const filePath = await saveAssetToStorage(patchedBlob, chunk.fileName);
          assets[chunk.type] = {
            type: chunk.type,
            fileName: chunk.fileName,
            filePath,
            mimeType: patchedBlob.type || chunk.blob.type || "video/webm",
          };
        }
      }

      // Add native screen recording if available
      if (nativeRecordingFilePath) {
        assets.screen = {
          type: "screen",
          fileName: "screen.webm",
          filePath: nativeRecordingFilePath,
          mimeType: "video/webm",
        };
        nativeRecordingFilePath = null; // Clear after use
      }

      const previousRecording = $lastRecording;
      await revokeRecordingAssets(previousRecording);

      const previewAsset = assets.screen ?? assets.webcam ?? null;
      $lastRecording = {
        assets,
        events: $inputEvents,
        duration: durationMs,
        fileName: `recording.${fileExtension}`,
        previewPath: previewAsset?.filePath,
      };

      $appView = "review";
    } catch (error) {
      console.error("Failed to finalize recording", error);
    } finally {
      recorders.forEach(({ stream }) =>
        stream.getTracks().forEach((track) => track.stop())
      );
    }
  };

  const startRecording = async () => {
    const assetsToCapture: {
      type: RecordingAssetType;
      stream: MediaStream;
      options: MediaRecorderOptions;
      fileName: string;
    }[] = [];

    const videoMime = getPreferredMimeType();
    recordingFileExtension = videoMime.ext;

    // Handle screen recording - use native XCap (Electron)
    if ($displayStream?.getTracks().length) {
      try {
        // Get the xcap-compatible source ID from the active share
        // ShareButton.svelte already converts Electron IDs to xcap format
        const activeShareData = $activeShare;
        const targetId = activeShareData?.id || "monitor:0";
        const captureType = targetId.startsWith("window:") ? "window" : "monitor";
        
        // Start native XCap recording for screen (WebM container)
        // This records WITHOUT the mouse cursor (xcap captures raw screen)
        nativeRecordingFilePath = await backendAPI.startNativeRecording({
          targetId,
          captureType,
          includeCursor: false,
          frameRate: $recordingFPS || 30,
          fileName: `screen.webm`,
        });
      } catch (error) {
        console.error("Failed to start native recording:", error);
        return;
      }
    }

    // Handle other assets with MediaRecorder (webcam, mouse, audio)
    if (canUseMediaRecorder && $webcamState.stream?.getTracks().length) {
      assetsToCapture.push({
        type: "webcam",
        stream: cloneStream($webcamState.stream),
        options: {
          mimeType: videoMime.mimeType,
          videoBitsPerSecond: 4 * 1000 * 1000,
        },
        fileName: `webcam.${recordingFileExtension}`,
      });
    }

    if (canUseMediaRecorder && $mouseCursorStream?.getTracks().length) {
      assetsToCapture.push({
        type: "mouse",
        stream: cloneStream($mouseCursorStream),
        options: {
          mimeType: videoMime.mimeType,
          videoBitsPerSecond: 3 * 1000 * 1000,
        },
        fileName: `mouse.${recordingFileExtension}`,
      });
    }

    if (canUseMediaRecorder && $micState.stream?.getTracks().length) {
      assetsToCapture.push({
        type: "audio",
        stream: cloneStream($micState.stream),
        options: {
          mimeType: "audio/webm;codecs=opus",
          audioBitsPerSecond: 128000,
        },
        fileName: "audio.webm",
      });
    }

    const recorders: AssetRecorderState[] = [];

    assetsToCapture.forEach((asset) => {
      const recorder = createAssetRecorder(
        asset.type,
        asset.stream,
        asset.options,
        asset.fileName
      );
      if (recorder) {
        recorders.push(recorder);
      } else {
        asset.stream.getTracks().forEach((track) => track.stop());
      }
    });

    // If we have native recording or MediaRecorder recorders, start recording
    if (nativeRecordingFilePath || recorders.length) {
      currentAssetRecorders = recorders;
      $recordingStartTime = performance.now();
      $inputEvents = [];
      $appView = "recorder";
    } else {
      // Clean up streams if no recording started
      assetsToCapture.forEach((asset) =>
        asset.stream.getTracks().forEach((track) => track.stop())
      );
    }
  };

  const stopRecording = async () => {
    // Stop native recording if active
    if (nativeRecordingFilePath) {
      try {
        await backendAPI.stopNativeRecording();
        
        // Fetch frame-synced mouse events from Rust and merge into inputEvents
        // This replaces uIOhook mouse positions with ones captured at frame time
        // and adds click events from Rust's rdev listener
        try {
          const nativeMouseEvents = await backendAPI.getRecordingMouseEvents();
          if (nativeMouseEvents?.length) {
            // Convert to PointerEventRecords with normalized coordinates
            // Map button states to appropriate event kinds
            const pointerRecords = nativeMouseEvents.map((e) => {
              let kind: "pointermove" | "pointerdown" | "pointerup" | "click" = "pointermove";
              let button = 0;
              
              // Map button state to event kind
              if (e.buttonState === "left_down") {
                kind = "pointerdown";
                button = 0;
              } else if (e.buttonState === "left_up") {
                kind = "pointerup";
                button = 0;
              } else if (e.buttonState === "right_down") {
                kind = "pointerdown";
                button = 2;
              } else if (e.buttonState === "right_up") {
                kind = "pointerup";
                button = 2;
              } else if (e.buttonState === "middle_down") {
                kind = "pointerdown";
                button = 1;
              } else if (e.buttonState === "middle_up") {
                kind = "pointerup";
                button = 1;
              }
              
              return {
                kind,
                t: e.timestampMs,
                x: e.normalizedX,
                y: e.normalizedY,
                button,
              };
            });
            
            // Keep key events from uIOhook, replace all pointer events with Rust data
            const existingEvents = $inputEvents;
            const keyEvents = existingEvents.filter((e) => 
              e.kind === "keydown" || e.kind === "keyup"
            );
            const mergedEvents = [...keyEvents, ...pointerRecords].sort((a, b) => a.t - b.t);
            $inputEvents = mergedEvents;
            
            await backendAPI.clearRecordingMouseEvents();
          }
        } catch (mouseError) {
          console.warn("Failed to fetch native mouse events:", mouseError);
        }
      } catch (error) {
        console.error("Failed to stop native recording:", error);
      }
    }
    
    if (!currentAssetRecorders.length && !nativeRecordingFilePath) {
      $recordingStartTime = null;
      return;
    }

    const durationMs = performance.now() - ($recordingStartTime ?? performance.now());
    $recordingStartTime = null;

    const recordersToFinalize = currentAssetRecorders.slice();
    currentAssetRecorders = [];

    recordersToFinalize.forEach(({ recorder }) => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    });

    void finalizeRecordingAssets(durationMs, recordersToFinalize, recordingFileExtension);
  };

  const onRecordButtonPress = () => {
    if ($isRecording) stopRecording();
    else startRecording();
  };

  // Cleanup on component destroy
</script>

<div
  class="relative h-screen w-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950"
  class:overflow-hidden={$appView === 'recorder'}
  class:overflow-auto={$appView !== 'recorder'}
>
  {#if $appView === "recorder"}
    <div class="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-1 lg:gap-8 lg:px-8">
      <div class="flex min-w-0 flex-col gap-4">
        <div class="relative flex-1 overflow-hidden rounded-3xl shadow-xl backdrop-blur-sm">
          <Preview />
        </div>
        <div class="rounded-3xl border border-slate-200/80 bg-white/80 shadow-lg backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70">
          <ActionBar on:record={onRecordButtonPress} />
        </div>
      </div>
      <RecorderSidebar />
    </div>
  {:else}
    <div class="w-full min-h-screen mr-0 ml-0 sm:ml-0 sm:mr-0">
      <ReviewView />
    </div>
  {/if}
</div>
