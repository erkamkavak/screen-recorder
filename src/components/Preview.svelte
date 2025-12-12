<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    activeShare,
    activeTheme,
    canvasDimensions,
    displayDimensions,
    generalLayoutState,
    inputEvents,
    isRecording,
    micAnalyzer,
    mouseCursorStream,
    previewScreenshotCapture,
    recordingFPS,
    recordingStartTime,
    screenLayoutState,
    webcamLayoutState,
    webcamState,
    type DrawArgs,
  } from "../lib/stores";
  import PreviewStage from "./preview/PreviewStage.svelte";
  import PreviewCanvas from "./preview/PreviewCanvas.svelte";
  import ScreenAlignmentOverlay from "./preview/ScreenAlignmentOverlay.svelte";
  import WebcamOverlay from "./preview/WebcamOverlay.svelte";
  import { createInputCapture } from "../lib/recording/useInputCapture";
  import { MouseOverlayRecorder } from "../lib/recording/mouseOverlayRecorder";

  let stageWidth = 0;
  let stageHeight = 0;
  let stageScale = 1;
  type PreviewCanvasHandle = {
    captureScreenshot: (type?: "png" | "jpeg") => Promise<Blob | null>;
  };
  let previewCanvasRef: PreviewCanvasHandle | null = null;

  const inputCapture = createInputCapture({
    isRecording,
    recordingStartTime,
    inputEvents,
  });

  const screenFocusedStore = inputCapture.screenFocused;
  let pointerUnsubscribe: (() => void) | null = null;
  let mouseRecorder: MouseOverlayRecorder | null = null;

  const initMouseRecorder = () => {
    if (mouseRecorder) return;
    const displayDims = $displayDimensions;
    if (!displayDims?.width || !displayDims?.height) return;

    mouseRecorder = new MouseOverlayRecorder({
      width: displayDims.width,
      height: displayDims.height,
      fps: $recordingFPS,
      onStream: (stream) => mouseCursorStream.set(stream),
    });
    mouseRecorder.start();
    pointerUnsubscribe = inputCapture.registerPointerListener((record) => {
      mouseRecorder?.updatePointer(record);
    });
  };

  $: if ($displayDimensions?.width && $displayDimensions?.height) {
    initMouseRecorder();
  }

  $: if (mouseRecorder && $displayDimensions) {
    mouseRecorder.updateSize($displayDimensions.width, $displayDimensions.height);
    mouseRecorder.updateFps($recordingFPS);
  }

  onDestroy(() => {
    inputCapture.destroy();
    pointerUnsubscribe?.();
    mouseRecorder?.destroy();
    mouseCursorStream.set(null);
    previewScreenshotCapture.set(null);
  });

  $: drawState = {
    theme: $activeTheme,
    canvasSize: $canvasDimensions,
    activeShare: $activeShare,
    webcamState: $webcamState,
    micAnalyzer: $micAnalyzer,
    webcamLayoutState: $webcamLayoutState,
    screenLayoutState: $screenLayoutState,
    generalLayoutState: $generalLayoutState,
  } satisfies Omit<DrawArgs, "ctx">;

  $: {
    if (!previewCanvasRef) {
      previewScreenshotCapture.set(null);
    } else {
      previewScreenshotCapture.set((type?: "png" | "jpeg") =>
        previewCanvasRef.captureScreenshot(type ?? "png")
      );
    }
  }
</script>

<PreviewStage
  canvasWidth={$canvasDimensions.width}
  canvasHeight={$canvasDimensions.height}
  on:dimensions={(event) => {
    stageWidth = event.detail.width;
    stageHeight = event.detail.height;
    stageScale = event.detail.scale;
  }}
>
  <PreviewCanvas
    canvasWidth={$canvasDimensions.width}
    canvasHeight={$canvasDimensions.height}
    recordingFPS={$recordingFPS}
    {drawState}
    scale={stageScale}
    bind:this={previewCanvasRef}
  />

  <ScreenAlignmentOverlay
    activeShare={$activeShare}
    screenLayoutState={screenLayoutState}
    canvasWidth={$canvasDimensions.width}
    canvasHeight={$canvasDimensions.height}
    screenFocused={$screenFocusedStore}
    onFocus={inputCapture.handleScreenFocus}
    onMouseOver={inputCapture.handleScreenMouseOver}
    onMouseLeave={inputCapture.handleScreenMouseLeave}
    attachOverlay={inputCapture.attachScreenOverlay}
    onPointerEvent={inputCapture.handleLocalPointerEvent}
  />

  <WebcamOverlay
    webcamLayoutState={webcamLayoutState}
    webcamState={$webcamState}
    containerWidth={stageWidth}
    containerHeight={stageHeight}
  />
</PreviewStage>
