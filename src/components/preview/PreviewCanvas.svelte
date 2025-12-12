<script lang="ts">
  import { get } from "svelte/store";
  import { onDestroy, onMount } from "svelte";
  import {
    activeBackground,
    canvasStream,
    type DrawArgs,
  } from "../../lib/stores";
  import { drawScreenShare, drawWebcam } from "../../lib/canvas/layoutDrawers";

  export let canvasWidth: number;
  export let canvasHeight: number;
  export let recordingFPS: number;
  export let drawState: Omit<DrawArgs, "ctx">;
  export let scale = 1;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  let animationId = 0;
  let fpsInterval = 1000 / recordingFPS;
  let then = 0;
  let loopInitialized = false;
  let currentFps = recordingFPS;

  let drawArgs: DrawArgs = {
    ctx,
    theme: drawState.theme,
    canvasSize: drawState.canvasSize,
    activeShare: drawState.activeShare,
    webcamState: drawState.webcamState,
    micAnalyzer: drawState.micAnalyzer,
    webcamLayoutState: drawState.webcamLayoutState,
    screenLayoutState: drawState.screenLayoutState,
    generalLayoutState: drawState.generalLayoutState,
  };

  const startLoop = () => {
    if (!ctx) return;
    cancelAnimationFrame(animationId);
    fpsInterval = 1000 / currentFps;
    then = performance.now();
    draw();
    animationId = requestAnimationFrame(loop);
    loopInitialized = true;
  };

  const loop = (time: number) => {
    const now = time;
    const elapsed = now - then;

    if (elapsed > fpsInterval) {
      then = now - (elapsed % fpsInterval);
      draw();
    }

    animationId = requestAnimationFrame(loop);
  };

  const draw = () => {
    const c = drawArgs.ctx;
    if (!c) return;

    c.clearRect(0, 0, canvasWidth, canvasHeight);
    c.imageSmoothingQuality = "high";
    c.globalCompositeOperation = "source-over";
    drawScreenShare(drawArgs);
    drawWebcam(drawArgs);

    c.globalCompositeOperation = "destination-over";
    const background = get(activeBackground);
    background?.draw(drawArgs);
  };

  const setupStream = () => {
    if (!canvas) return;
    const existing = get(canvasStream);
    existing?.getTracks().forEach((track) => track.stop());

    const stream = canvas.captureStream(currentFps);
    canvasStream.set(stream);
  };

  onMount(() => {
    ctx = canvas.getContext("2d");
    drawArgs.ctx = ctx;
    startLoop();
    setupStream();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    const existing = get(canvasStream);
    existing?.getTracks().forEach((track) => track.stop());
    canvasStream.set(null);
  });

  $: if (ctx) {
    drawArgs.ctx = ctx;
  }

  $: drawArgs.theme = drawState.theme;
  $: drawArgs.canvasSize = drawState.canvasSize;
  $: drawArgs.activeShare = drawState.activeShare;
  $: drawArgs.webcamState = drawState.webcamState;
  $: drawArgs.micAnalyzer = drawState.micAnalyzer;
  $: drawArgs.webcamLayoutState = drawState.webcamLayoutState;
  $: drawArgs.screenLayoutState = drawState.screenLayoutState;
  $: drawArgs.generalLayoutState = drawState.generalLayoutState;

  $: if (loopInitialized && recordingFPS !== currentFps) {
    currentFps = recordingFPS;
    startLoop();
    setupStream();
  }

  $: if (canvas) {
    // Keep capture stream aligned with scale and fps changes
    setupStream();
  }

  export const captureScreenshot = async (type: "png" | "jpeg" = "png") => {
    if (!canvas) return null;
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), `image/${type}`);
    });
  };
</script>

<canvas
  width="{canvasWidth}px"
  height="{canvasHeight}px"
  style="transform: scale({scale}); transform-origin: top left;"
  bind:this={canvas}
></canvas>
