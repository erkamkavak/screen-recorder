<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    activeShare,
    activeTheme,
    canvasDimensions,
    generalLayoutState,
    inputEvents,
    isRecording,
    micAnalyzer,
    recordingFPS,
    recordingStartTime,
    screenLayoutState,
    webcamLayoutState,
    webcamState,
    type DrawArgs,
  } from "../stores";
  import PreviewStage from "./preview/PreviewStage.svelte";
  import PreviewCanvas from "./preview/PreviewCanvas.svelte";
  import ScreenAlignmentOverlay from "./preview/ScreenAlignmentOverlay.svelte";
  import WebcamOverlay from "./preview/WebcamOverlay.svelte";
  import { createInputCapture } from "./preview/useInputCapture";

  let stageWidth = 0;
  let stageHeight = 0;
  let stageScale = 1;

  const inputCapture = createInputCapture({
    isRecording,
    recordingStartTime,
    inputEvents,
  });

  const screenFocusedStore = inputCapture.screenFocused;

  onDestroy(() => {
    inputCapture.destroy();
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
