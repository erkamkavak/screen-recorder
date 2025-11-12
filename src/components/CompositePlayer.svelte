<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { TimelineSnapshot } from "../stores/timeline";
  import { computeZoomState } from "../utils/timelinePlayback";
  import { calculateScreenPlacement, drawScreenShare, drawWebcam } from "../utils/layoutDrawers";
  import type {
    Background,
    CanvasSize,
    DrawArgs,
    GeneralLayoutState,
    RecordingAssets,
    RecordingAsset,
    ScreenState,
    Theme,
    WebcamLayoutState,
    Share,
  } from "../stores";
  import { getAssetUrlFromFile } from "../utils/assetStorage";

  export let assets: RecordingAssets;
  export let canvasSize: CanvasSize;
  export let generalLayoutState: GeneralLayoutState;
  export let screenLayoutState: ScreenState;
  export let webcamLayoutState: WebcamLayoutState;
  export let theme: Theme;
  export let background: Background;
  export let snapshot: TimelineSnapshot;
  export let showScreen: boolean = true;
  export let showWebcam: boolean = true;
  export let showMouse: boolean = true;
  export let includeAudio: boolean = true;
  export let frameRate: number = 30;

  export let duration: number = 0;
  export let currentTime: number = 0;

  let canvasEl: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  let screenVideo: HTMLVideoElement | null = null;
  let webcamVideo: HTMLVideoElement | null = null;
  let mouseVideo: HTMLVideoElement | null = null;
  let audioEl: HTMLAudioElement | null = null;

  let screenUrl: string | null = null;
  let webcamUrl: string | null = null;
  let mouseUrl: string | null = null;
  let audioUrl: string | null = null;

  let screenShare: Share | null = null;
  let drawArgs: DrawArgs | null = null;
  let animationId: number;
  let playing = false;

  const waitForMetadata = (media: HTMLMediaElement) =>
    new Promise<void>((resolve, reject) => {
      if (media.readyState >= 1) {
        resolve();
        return;
      }
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to load media metadata"));
      };
      const cleanup = () => {
        media.removeEventListener("loadedmetadata", onLoaded);
        media.removeEventListener("error", onError);
      };
      media.addEventListener("loadedmetadata", onLoaded);
      media.addEventListener("error", onError);
    });

  const createVideo = (src: string) => {
    const v = document.createElement("video");
    v.src = src;
    v.crossOrigin = "anonymous";
    v.playsInline = true;
    v.muted = true;
    return v;
  };

  const createAudio = (src: string) => {
    const a = document.createElement("audio");
    a.src = src;
    a.crossOrigin = "anonymous";
    a.muted = false;
    return a;
  };

  const loadAssets = async () => {
    const screenAsset = assets.screen;
    if (!screenAsset) return;
    screenUrl = await safeLoad(screenAsset);
    if (!screenUrl) return;
    screenVideo = createVideo(screenUrl);
    await waitForMetadata(screenVideo);

    webcamUrl = await safeLoad(assets.webcam ?? null);
    webcamVideo = webcamUrl ? createVideo(webcamUrl) : null;
    if (webcamVideo) await waitForMetadata(webcamVideo);

    mouseUrl = await safeLoad(assets.mouse ?? null);
    mouseVideo = mouseUrl ? createVideo(mouseUrl) : null;
    if (mouseVideo) await waitForMetadata(mouseVideo);

    audioUrl = includeAudio ? await safeLoad(assets.audio ?? null) : null;
    audioEl = audioUrl ? createAudio(audioUrl) : null;

    canvasEl.width = canvasSize.width;
    canvasEl.height = canvasSize.height;
    ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    screenShare = {
      id: "composite-screen",
      preview: screenVideo,
      stream: null,
      width: screenVideo.videoWidth,
      height: screenVideo.videoHeight,
    };

    drawArgs = {
      ctx,
      theme,
      canvasSize,
      activeShare: screenShare,
      webcamState: {
        // Provide a dummy stream when we have a webcam video so layoutDrawers.drawWebcam runs
        stream: webcamVideo ? new MediaStream() : null,
        preview: webcamVideo,
        width: webcamVideo?.videoWidth ?? 0,
        height: webcamVideo?.videoHeight ?? 0,
      },
      micAnalyzer: null,
      generalLayoutState,
      webcamLayoutState,
      screenLayoutState,
    };

    duration = screenVideo.duration || 0;
    currentTime = screenVideo.currentTime || 0;

    // Draw initial frame so the canvas isn't blank before play
    drawFrame();
  };

  const safeLoad = async (asset?: RecordingAsset | null) => {
    if (!asset) return null;
    try {
      return await getAssetUrlFromFile(asset.filePath, asset.mimeType);
    } catch {
      return null;
    }
  };

  const applyZoom = (scale: number, focusX: number, focusY: number) => {
    if (!ctx) return;
    const pivotX = focusX * canvasEl.width;
    const pivotY = focusY * canvasEl.height;
    ctx.translate(pivotX, pivotY);
    ctx.scale(scale, scale);
    ctx.translate(-pivotX, -pivotY);
  };

  const drawFrame = () => {
    if (!ctx || !screenVideo || !drawArgs) return;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.imageSmoothingQuality = "high";
    ctx.globalCompositeOperation = "source-over";

    // Zoom only the screen track
    ctx.save();
    const { scale, focusX, focusY } = computeZoomState(snapshot.events, screenVideo.currentTime);
    applyZoom(scale, focusX, focusY);
    if (showScreen) {
      drawScreenShare(drawArgs);
    }
    ctx.restore();

    // Draw mouse overlay without zoom
    if (showMouse && mouseVideo) {
      const placement = calculateScreenPlacement(
        canvasSize,
        drawArgs.activeShare,
        screenLayoutState,
        generalLayoutState
      );
      if (placement) {
        ctx.drawImage(mouseVideo, placement.x, placement.y, placement.width, placement.height);
      }
    }

    // Draw webcam without zoom
    if (showWebcam && webcamVideo) {
      drawWebcam(drawArgs);
    }

    // Background behind everything
    ctx.globalCompositeOperation = "destination-over";
    background.draw(drawArgs);
    ctx.globalCompositeOperation = "source-over";
  };

  const startLoop = () => {
    cancelAnimationFrame(animationId);
    const loop = () => {
      if (!playing) return;
      drawFrame();
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
  };

  const play = async () => {
    if (!screenVideo) return;
    try {
      playing = true;
      // Ensure we start within trim range
      if (screenVideo.currentTime < trimStart() || screenVideo.currentTime > trimEnd()) {
        screenVideo.currentTime = trimStart();
      }
      // keep media in sync
      if (webcamVideo) webcamVideo.currentTime = screenVideo.currentTime;
      if (mouseVideo) mouseVideo.currentTime = screenVideo.currentTime;
      if (audioEl) audioEl.currentTime = screenVideo.currentTime;
      await Promise.all([
        screenVideo.play(),
        webcamVideo?.play() ?? Promise.resolve(),
        mouseVideo?.play() ?? Promise.resolve(),
        includeAudio && audioEl ? audioEl.play() : Promise.resolve(),
      ]);
      startLoop();
      startSyncTimeLoop();
    } catch (e) {
      playing = false;
    }
  };

  const updateAudio = async () => {
    if (!assets) return;
    if (includeAudio) {
      if (!audioEl) {
        const url = await safeLoad(assets.audio ?? null);
        audioUrl = url;
        audioEl = url ? createAudio(url) : null;
        if (audioEl) audioEl.currentTime = screenVideo?.currentTime ?? 0;
      }
      if (playing) {
        try { await audioEl?.play(); } catch {}
      }
    } else {
      try { audioEl?.pause(); } catch {}
      audioEl = null;
      audioUrl = null;
    }
  };

  $: (async () => { await updateAudio(); })();

  // Redraw once when toggles change and we're paused
  $: if (!playing) { drawFrame(); }

  const pause = () => {
    playing = false;
    cancelAnimationFrame(animationId);
    screenVideo?.pause();
    webcamVideo?.pause();
    mouseVideo?.pause();
    audioEl?.pause();
  };

  const trimStart = () => Math.max(0, snapshot.trimStart || 0);
  const trimEnd = () => {
    const d = duration || screenVideo?.duration || 0;
    return Math.max(0, Math.min(d, snapshot.trimEnd ?? d));
  };

  const clampToTrim = (t: number) => Math.max(trimStart(), Math.min(trimEnd(), t));

  const seek = (value: number) => {
    if (!screenVideo) return;
    const clamped = clampToTrim(value);
    screenVideo.currentTime = clamped;
    if (webcamVideo) webcamVideo.currentTime = clamped;
    if (mouseVideo) mouseVideo.currentTime = clamped;
    if (audioEl) audioEl.currentTime = clamped;
    currentTime = clamped;
  };

  let syncId: number;
  const startSyncTimeLoop = () => {
    cancelAnimationFrame(syncId);
    const update = () => {
      if (!screenVideo) return;
      currentTime = screenVideo.currentTime;
      // Stop at trim end
      if (currentTime >= trimEnd() - 0.0005) {
        pause();
        currentTime = trimEnd();
        screenVideo.currentTime = currentTime;
        if (webcamVideo) webcamVideo.currentTime = currentTime;
        if (mouseVideo) mouseVideo.currentTime = currentTime;
        if (audioEl) audioEl.currentTime = currentTime;
        drawFrame();
        return;
      }
      if (playing) {
        syncId = requestAnimationFrame(update);
      }
    };
    syncId = requestAnimationFrame(update);
  };

  const togglePlay = async () => {
    if (playing) pause();
    else await play();
  };

  const onSeekInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = Number(target.value);
    if (!Number.isNaN(value)) seek(value);
    // redraw when paused
    if (!playing) drawFrame();
  };

  onMount(async () => {
    await loadAssets();
  });

  const formatTime = (value: number) => {
    if (!isFinite(value) || value < 0) return "00:00";
    const wholeSeconds = Math.floor(value);
    const minutes = Math.floor(wholeSeconds / 60);
    const seconds = wholeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    pause();
  });
</script>

<div class="player-shell">
  <div class="video-frame" style={`aspect-ratio: ${canvasSize.width}/${canvasSize.height};`}>
    <canvas bind:this={canvasEl} />
    <div class="controls-overlay">
      <button class="control-button" on:click={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        {#if playing}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        {/if}
      </button>
      <div class="time-display">{formatTime(currentTime)} / {formatTime(duration)}</div>
    </div>
  </div>
  <div class="timeline">
    <input
      class="timeline-range"
      type="range"
      min={0}
      max={duration}
      step="0.01"
      value={currentTime}
      on:input={onSeekInput}
    />
  </div>
</div>


<style>
  .player-shell { display: flex; flex-direction: column; gap: 0.75rem; }
  .video-frame { position: relative; width: 100%; background: transparent; display: flex; overflow: hidden; border-radius: 0; }
  canvas { width: 100%; height: 100%; display: block; }
  .controls-overlay { position: absolute; left: 0; bottom: 0; padding: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
  .control-button { width: 2.25rem; height: 2.25rem; border-radius: 9999px; border: 1px solid #cbd5e1; background: #ffffff; color: #111827; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
  .time-display { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 0.85rem; color: #cbd5e1; }
  .timeline-range { width: 100%; appearance: none; background: #e5e7eb; height: 0.35rem; border-radius: 9999px; outline: none; cursor: pointer; }
  .timeline-range::-webkit-slider-thumb { appearance: none; width: 0.85rem; height: 0.85rem; border-radius: 9999px; background: white; border: 2px solid #111827; }
  .timeline-range::-moz-range-thumb { width: 0.85rem; height: 0.85rem; border-radius: 9999px; background: white; border: 2px solid #111827; }
</style>
