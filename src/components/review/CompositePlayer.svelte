<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { TimelineSnapshot } from "../../stores/timeline";
  import { computeZoomState } from "../../utils/timelinePlayback";
  import { drawScreenShare, drawWebcam } from "../../utils/layoutDrawers";
  import { computePointerState, type ComputedPointerState } from "../../utils/pointerState";
  import { calculateScreenPlacement } from "../../utils/layoutDrawers";
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
  } from "../../stores";
  import { getAssetUrlFromFile } from "../../utils/assetStorage";

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

  export let pointerRecords: any[] = [];
  export let pointerIconUrl: string | null = null;
  export let pointerIconPressedUrl: string | null = null;
  export let pointerIndicatorSize: number = 18;

  let pointerIconImage: HTMLImageElement | null = null;
  let pointerPressedIconImage: HTMLImageElement | null = null;
  let pointerIconImageToken = 0;
  let pointerPressIconImageToken = 0;

  export let duration: number = 0;
  export let currentTime: number = 0;
  export let screenWidth: number = 0;
  export let screenHeight: number = 0;

  let canvasEl: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  let screenVideo: HTMLVideoElement | null = null;
  let webcamVideo: HTMLVideoElement | null = null;
  let audioEl: HTMLAudioElement | null = null;

  let screenUrl: string | null = null;
  let webcamUrl: string | null = null;
  let audioUrl: string | null = null;

  let screenShare: Share | null = null;
  let drawArgs: DrawArgs | null = null;
  let animationId: number;
  let playing = false;

  $: if (pointerIconUrl) {
    const currentToken = ++pointerIconImageToken;
    loadImage(pointerIconUrl)
      .then((img) => {
        if (currentToken !== pointerIconImageToken) return;
        pointerIconImage = img;
      })
      .catch(() => {
        if (currentToken !== pointerIconImageToken) return;
        pointerIconImage = null;
      });
  } else {
    pointerIconImageToken += 1;
    pointerIconImage = null;
  }

  $: if (pointerIconPressedUrl) {
    const currentToken = ++pointerPressIconImageToken;
    loadImage(pointerIconPressedUrl)
      .then((img) => {
        if (currentToken !== pointerPressIconImageToken) return;
        pointerPressedIconImage = img;
      })
      .catch(() => {
        if (currentToken !== pointerPressIconImageToken) return;
        pointerPressedIconImage = null;
      });
  } else {
    pointerPressIconImageToken += 1;
    pointerPressedIconImage = null;
  }  

  const waitForMetadata = (media: HTMLMediaElement, timeoutMs = 5000) =>
    new Promise<void>((resolve) => {
      if (media.readyState >= 1) {
        console.log("[waitForMetadata] already ready", {
          src: media.currentSrc,
          readyState: media.readyState,
          duration: media.duration,
        });
        resolve();
        return;
      }
      let resolved = false;
      const onLoaded = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        console.log("[waitForMetadata] loadedmetadata", {
          src: media.currentSrc,
          readyState: media.readyState,
          duration: media.duration,
        });
        resolve();
      };
      const onCanPlay = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        console.log("[waitForMetadata] canplay", {
          src: media.currentSrc,
          readyState: media.readyState,
          duration: media.duration,
        });
        resolve();
      };
      const onError = () => {
        const err = media.error;
        console.warn("[waitForMetadata] media error (will retry with timeout)", {
          src: media.currentSrc,
          readyState: media.readyState,
          networkState: media.networkState,
          errorCode: err ? err.code : null,
          errorMessage: err && (err as any).message,
        });
        // Don't reject - let timeout handle it
      };
      const cleanup = () => {
        media.removeEventListener("loadedmetadata", onLoaded);
        media.removeEventListener("canplay", onCanPlay);
        media.removeEventListener("error", onError);
      };
      media.addEventListener("loadedmetadata", onLoaded);
      media.addEventListener("canplay", onCanPlay);
      media.addEventListener("error", onError);
      
      // Timeout fallback - proceed anyway after timeout
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        console.warn("[waitForMetadata] timeout - proceeding anyway", {
          src: media.currentSrc,
          readyState: media.readyState,
        });
        resolve();
      }, timeoutMs);
    });

  const createVideo = (src: string) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.playsInline = true;
    v.muted = true;
    v.src = src;
    v.load();
    return v;
  };

  const loadImage = (src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
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

    audioUrl = includeAudio ? await safeLoad(assets.audio ?? null) : null;
    audioEl = audioUrl ? createAudio(audioUrl) : null;

    // Load pointer icons
    if (pointerIconUrl) {
      pointerIconImage = await loadImage(pointerIconUrl);
    }
    if (pointerIconPressedUrl) {
      pointerPressedIconImage = await loadImage(pointerIconPressedUrl);
    }

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
    
    // Export screen dimensions for pointer overlay positioning
    screenWidth = screenVideo.videoWidth;
    screenHeight = screenVideo.videoHeight;

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

    // Handle NaN duration (can happen if metadata didn't load properly)
    const videoDuration = screenVideo.duration;
    duration = isFinite(videoDuration) && videoDuration > 0 ? videoDuration : 0;
    currentTime = screenVideo.currentTime || 0;
    
    // If duration is still 0, try to get it from durationchange event
    if (duration === 0) {
      screenVideo.addEventListener("durationchange", () => {
        const d = screenVideo?.duration;
        if (d && isFinite(d) && d > 0) {
          duration = d;
        }
      });
    }

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

  const drawMouseCursor = (pointerState: ComputedPointerState) => {
    if (!showMouse || pointerRecords.length === 0 || !pointerState.visible) return;
    
    const placement = calculateScreenPlacement(
      canvasSize,
      drawArgs.activeShare,
      screenLayoutState,
      generalLayoutState
    );
    
    if (!placement) return;
    
    // Calculate pointer position with zoom
    const pointerX = placement.x + pointerState.x * placement.width;
    const pointerY = placement.y + pointerState.y * placement.height;
    
    // Select appropriate icon
    const cursorShape = pointerState.cursorShape || "default";
    const usePointerIcon = cursorShape === "pointer" || pointerState.isPressed;
    const icon = usePointerIcon
      ? pointerPressedIconImage
      : pointerIconImage;
    
    if (icon) {
      const size = pointerIndicatorSize * 5;
      ctx.drawImage(icon, pointerX - size / 2, pointerY - Math.floor(2 * size / 3), size, size);
    } else {
      // Fallback to drawn cursor
      ctx.fillStyle = cursorShape === "pointer" ? "#000000" : "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      const size = pointerIndicatorSize;
      
      // Draw simple cursor shape with transform: translate(0%, -100%)
      ctx.beginPath();
      ctx.moveTo(pointerX, pointerY - size);
      ctx.lineTo(pointerX + size * 0.8, pointerY - size);
      ctx.lineTo(pointerX, pointerY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  const drawFrame = () => {
    if (!ctx || !screenVideo || !drawArgs) return;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.imageSmoothingQuality = "high";
    ctx.globalCompositeOperation = "source-over";

    ctx.save();
    const { scale, focusX, focusY } = computeZoomState(snapshot.events, screenVideo.currentTime);
    const pointerState = computePointerState(screenVideo.currentTime, pointerRecords);
    const zoomFocusX = pointerState.visible ? pointerState.x : focusX;
    const zoomFocusY = pointerState.visible ? pointerState.y : focusY;
    applyZoom(scale, zoomFocusX, zoomFocusY);
    if (showScreen) {
      drawScreenShare(drawArgs);
      drawMouseCursor(pointerState);
    }
    ctx.restore();

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
      if (audioEl) audioEl.currentTime = screenVideo.currentTime;
      await Promise.all([
        screenVideo.play(),
        webcamVideo?.play() ?? Promise.resolve(),
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

  // Redraw once when toggles change and we're paused. Include pointer size so the paused view updates immediately.
  $: if (!playing && pointerIndicatorSize !== undefined) {
    drawFrame();
  }

  const pause = () => {
    playing = false;
    cancelAnimationFrame(animationId);
    screenVideo?.pause();
    webcamVideo?.pause();
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
