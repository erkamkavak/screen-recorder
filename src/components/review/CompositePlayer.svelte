<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { TimelineSnapshot } from "../../lib/stores/timeline";
  import { computeZoomState } from "../../lib/timeline/timelinePlayback";
  import { drawScreenShare, drawWebcam } from "../../lib/canvas/layoutDrawers";
  import { computePointerState, type ComputedPointerState } from "../../lib/pointer/pointerState";
  import { calculateScreenPlacement } from "../../lib/canvas/layoutDrawers";
  import { drawCaptionsOverlay } from "../../lib/canvas/captions";
  import { drawClickRipplesOverlay, drawPointerCursorOverlay } from "../../lib/canvas/pointerOverlays";
  import { createAudioElement, createVideoElement, loadImage, waitForMetadata } from "../../lib/canvas/mediaElements";
  import type { RecordingSegment } from "../../lib/stores";
  import { getSegmentForTime, getTotalSegmentsDuration } from "../../lib/rendering/segmentRenderer";
  import { getPointerRecords } from "../../lib/pointer/pointerState";
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
  } from "../../lib/stores";
  import { getAssetUrlFromFile } from "../../lib/backend/assetStorage";
  import PlayerControls from "./PlayerControls.svelte";
  import { reviewSessionStore, pointerRecords } from "../../lib/stores/reviewSession";

  export let assets: RecordingAssets;
  export let canvasSize: CanvasSize;
  export let generalLayoutState: GeneralLayoutState;
  export let screenLayoutState: ScreenState;
  export let webcamLayoutState: WebcamLayoutState;
  export let theme: Theme;
  export let background: Background;
  export let snapshot: TimelineSnapshot;
  export let segments: RecordingSegment[] = [];

  export let transcript: { segments: { startMs: number; endMs: number; text: string }[] } | null = null;

  export let pointerIconUrl: string | null = null;
  export let pointerIconPressedUrl: string | null = null;

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

  type SegmentMedia = {
    segment: RecordingSegment;
    startSec: number;
    screenUrl: string;
    webcamUrl: string | null;
    audioUrl: string | null;
    screenVideo: HTMLVideoElement;
    webcamVideo: HTMLVideoElement | null;
    audioEl: HTMLAudioElement | null;
  };
  let segmentMediaById = new Map<string, SegmentMedia>();
  let segmentStartsSec: number[] = [];
  let segmentOriginalStartsSec: number[] = [];
  let activeSegmentIndex = 0;
  let activeSegmentStartSec = 0;
  let activeSegment: RecordingSegment | null = null;
  let activeSegmentOriginalStartSec = 0;
  let activeSegmentId: string | null = null;

  let screenShare: Share | null = null;
  let drawArgs: DrawArgs | null = null;
  let animationId: number;
  let playing = false;

  const hasSegments = () => (segments?.length ?? 0) >= 1;

  const getSegmentStartsSec = (segs: RecordingSegment[]) => {
    const starts: number[] = [];
    let acc = 0;
    for (const seg of segs) {
      starts.push(acc);
      acc += Math.max(0, (seg.duration - seg.trimStart - seg.trimEnd) / 1000);
    }
    return starts;
  };

  const getSegmentOriginalStartsSec = (segs: RecordingSegment[]) => {
    const starts: number[] = [];
    let acc = 0;
    for (const seg of segs) {
      starts.push(acc);
      acc += Math.max(0, seg.duration / 1000);
    }
    return starts;
  };

  const activateSegment = async (nextIndex: number, localTimeSec: number) => {
    const seg = segments[nextIndex];
    if (!seg) return;
    const next = segmentMediaById.get(seg.id);
    if (!next) return;
    activeSegmentIndex = nextIndex;
    activeSegmentStartSec = segmentStartsSec[nextIndex] ?? next.startSec ?? 0;
    activeSegment = next.segment;
    activeSegmentOriginalStartSec = segmentOriginalStartsSec[nextIndex] ?? 0;
    activeSegmentId = seg.id;

    // Pause old media before swapping references
    try { screenVideo?.pause(); } catch {}
    try { webcamVideo?.pause(); } catch {}
    try { audioEl?.pause(); } catch {}

    screenVideo = next.screenVideo;
    webcamVideo = next.webcamVideo;
    audioEl = next.audioEl;
    screenUrl = next.screenUrl;
    webcamUrl = next.webcamUrl;
    audioUrl = next.audioUrl;

    // Ensure metadata-based sizing and share preview are updated
    screenShare = {
      id: "composite-screen",
      preview: screenVideo,
      stream: null,
      width: screenVideo.videoWidth,
      height: screenVideo.videoHeight,
    };
    screenWidth = screenVideo.videoWidth;
    screenHeight = screenVideo.videoHeight;
    // also update drawArgs active share to reflect new segment and dimensions
    // (activateSegment can run before drawArgs is initialized)
    if (drawArgs) {
      drawArgs = {
        ...drawArgs,
        activeShare: screenShare,
        webcamState: {
          ...drawArgs.webcamState,
          preview: webcamVideo,
          width: webcamVideo?.videoWidth ?? 0,
          height: webcamVideo?.videoHeight ?? 0,
        },
      };
    }

    const clampedLocal = Math.max(0, Math.min(screenVideo.duration || localTimeSec, localTimeSec));
    screenVideo.currentTime = clampedLocal;
    if (webcamVideo) webcamVideo.currentTime = clampedLocal;
    if (audioEl) audioEl.currentTime = clampedLocal;

    if (playing) {
      try {
        await Promise.all([
          screenVideo.play(),
          webcamVideo?.play() ?? Promise.resolve(),
          audioEl?.play() ?? Promise.resolve(),
        ]);
      } catch (e) {
        console.warn("Failed to resume playback after segment activation", e);
      }
    }
  };

  const setGlobalTime = async (timelineSec: number) => {
    const clamped = clampToTimeline(timelineSec);
    if (!hasSegments()) {
      seek(clamped);
      return;
    }
    const info = getSegmentForTime(segments, clamped);
    if (!info) return;

    if (info.segmentIndex !== activeSegmentIndex) {
      await activateSegment(info.segmentIndex, info.localTime);
    } else {
      if (screenVideo) screenVideo.currentTime = info.localTime;
      if (webcamVideo) webcamVideo.currentTime = info.localTime;
      if (audioEl) audioEl.currentTime = info.localTime;
    }
    currentTime = clamped;
  };

  $: if (segments || $reviewSessionStore.includeAudioTrack) {
    const starts = getSegmentStartsSec(segments || []);
    segmentStartsSec = starts;
    segmentOriginalStartsSec = getSegmentOriginalStartsSec(segments || []);
    duration = Math.max(0, getTotalSegmentsDuration(segments || []) / 1000);
    
    if (activeSegmentId) {
      const foundIdx = (segments || []).findIndex(s => s.id === activeSegmentId);
      if (foundIdx !== -1) {
        activeSegmentIndex = foundIdx;
        activeSegment = segments[foundIdx];
        activeSegmentStartSec = starts[foundIdx];

        // Ensure video is at the correct local time for the current global time
        // Use a small epsilon to avoid unnecessary seeking during playback
        if (screenVideo && !playing) {
          const info = getSegmentForTime(segments, currentTime);
          if (info && info.segmentIndex === activeSegmentIndex) {
            if (Math.abs(screenVideo.currentTime - info.localTime) > 0.05) {
              screenVideo.currentTime = info.localTime;
              if (webcamVideo) webcamVideo.currentTime = info.localTime;
              if (audioEl) audioEl.currentTime = info.localTime;
            }
          }
        }
      }
    }
  }

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

  const loadAssets = async () => {
    segmentMediaById = new Map();
    segmentStartsSec = [];
    segmentOriginalStartsSec = [];
    activeSegmentIndex = 0;
    activeSegmentStartSec = 0;
    activeSegment = null;
    activeSegmentOriginalStartSec = 0;
    activeSegmentId = null;

    if (hasSegments()) {
      const starts = getSegmentStartsSec(segments);
      segmentStartsSec = starts;
      segmentOriginalStartsSec = getSegmentOriginalStartsSec(segments);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segAssets = seg.assets;
        const screenAsset = segAssets.screen;
        if (!screenAsset) continue;
        const segScreenUrl = await safeLoad(screenAsset);
        if (!segScreenUrl) continue;
        const segWebcamUrl = await safeLoad(segAssets.webcam ?? null);
        const segAudioUrl = $reviewSessionStore.includeAudioTrack ? await safeLoad(segAssets.audio ?? null) : null;

        const segScreenVideo = createVideoElement(segScreenUrl);
        const segWebcamVideo = segWebcamUrl ? createVideoElement(segWebcamUrl) : null;
        await Promise.all([
          waitForMetadata(segScreenVideo),
          segWebcamVideo ? waitForMetadata(segWebcamVideo) : Promise.resolve(),
        ]);
        const segAudioEl = segAudioUrl ? createAudioElement(segAudioUrl) : null;

        segmentMediaById.set(seg.id, {
          segment: seg,
          startSec: starts[i] ?? 0,
          screenUrl: segScreenUrl,
          webcamUrl: segWebcamUrl,
          audioUrl: segAudioUrl,
          screenVideo: segScreenVideo,
          webcamVideo: segWebcamVideo,
          audioEl: segAudioEl,
        });
      }

      // Activate first loaded segment
      if (!segmentMediaById.size) return;
      // Find first segment that actually loaded media for
      const firstIdx = segments.findIndex((s) => segmentMediaById.has(s.id));
      if (firstIdx < 0) return;
      
      const info = getSegmentForTime(segments, currentTime);
      let targetIdx = info?.segmentIndex ?? firstIdx;
      if (!segmentMediaById.has(segments[targetIdx]?.id)) {
        targetIdx = firstIdx;
      }
      const targetLocalTime = info?.segmentIndex === targetIdx
        ? (info?.localTime ?? (segments[targetIdx].trimStart / 1000))
        : (segments[targetIdx].trimStart / 1000);
      
      await activateSegment(targetIdx, targetLocalTime);
      duration = Math.max(0, getTotalSegmentsDuration(segments) / 1000);
    } else {
      // Fallback for absolutely no segments (should not happen with lastRecording)
      const screenAsset = assets.screen;
      if (!screenAsset) return;
      screenUrl = await safeLoad(screenAsset);
      if (!screenUrl) return;
      screenVideo = createVideoElement(screenUrl);
      await waitForMetadata(screenVideo);

      webcamUrl = await safeLoad(assets.webcam ?? null);
      webcamVideo = webcamUrl ? createVideoElement(webcamUrl) : null;
      if (webcamVideo) await waitForMetadata(webcamVideo);

      audioUrl = $reviewSessionStore.includeAudioTrack ? await safeLoad(assets.audio ?? null) : null;
      audioEl = audioUrl ? createAudioElement(audioUrl) : null;
    }

    if (!screenVideo) {
      console.warn("CompositePlayer: screenVideo not available after loadAssets");
      return;
    }

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
    if (!hasSegments() && screenVideo) {
      const videoDuration = screenVideo.duration;
      duration = isFinite(videoDuration) && videoDuration > 0 ? videoDuration : 0;
      currentTime = screenVideo.currentTime || 0;
    }
    
    // If duration is still 0, try to get it from durationchange event
    if (!hasSegments() && screenVideo && duration === 0) {
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


  const getPlacement = () => {
    if (!drawArgs) return null;
    return calculateScreenPlacement(
      canvasSize,
      drawArgs.activeShare,
      screenLayoutState,
      generalLayoutState
    );
  };

  const drawFrame = () => {
    if (!ctx || !screenVideo || !drawArgs) return;
    const localOriginalTimeSec = screenVideo.currentTime || 0;
    const segmentZoomEvents = activeSegmentId ? (snapshot.segmentEvents?.[activeSegmentId] ?? []) : [];
    const zoomEvalTimeSec = hasSegments() ? localOriginalTimeSec : (screenVideo.currentTime || 0);

    const segmentPointerRecords = hasSegments() && activeSegment
      ? getPointerRecords(activeSegment.events)
      : $pointerRecords;
    const segmentClickRecords = segmentPointerRecords.filter((event) => event.kind === "click");

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.imageSmoothingQuality = "high";
    ctx.globalCompositeOperation = "source-over";

    ctx.save();
    const { scale, focusX, focusY } = computeZoomState(segmentZoomEvents, zoomEvalTimeSec);
    const pointerState = computePointerState(zoomEvalTimeSec, segmentPointerRecords);
    const zoomFocusX = pointerState.visible ? pointerState.x : focusX;
    const zoomFocusY = pointerState.visible ? pointerState.y : focusY;
    applyZoom(scale, zoomFocusX, zoomFocusY);
    if (true) { // Always show screen if it's there
      drawScreenShare(drawArgs);
      const placement = getPlacement();
      if (ctx && placement && $reviewSessionStore.includeClickTrack) {
        drawClickRipplesOverlay({
          ctx,
          placement,
          clickRecords: segmentClickRecords,
          timeSec: zoomEvalTimeSec,
          canvasSize,
          pointerSize: $reviewSessionStore.pointerIndicatorSize,
        });
      }
      if (ctx && placement && $reviewSessionStore.includePointerTrack) {
        drawPointerCursorOverlay({
          ctx,
          placement,
          canvasSize,
          pointerSize: $reviewSessionStore.pointerIndicatorSize,
          pointerState,
          iconDefault: pointerIconImage,
          iconPressed: pointerPressedIconImage,
        });
      }
    }
    ctx.restore();

    // Draw webcam without zoom
    if ($reviewSessionStore.includeWebcamTrack && webcamVideo) {
      drawWebcam(drawArgs);
    }

    // Draw captions outside zoom
    if (true) {
      if (ctx && $reviewSessionStore.showCaptions && transcript?.segments?.length) {
        drawCaptionsOverlay({
          ctx,
          canvas: canvasEl,
          canvasSize,
          timeSec: zoomEvalTimeSec,
          segments: transcript.segments,
        });
      }
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
      // Ensure we start within timeline
      if (duration > 0 && (currentTime < 0 || currentTime > duration)) {
        await setGlobalTime(0);
      }
      // keep media in sync
      if (webcamVideo) webcamVideo.currentTime = screenVideo.currentTime;
      if (audioEl) audioEl.currentTime = screenVideo.currentTime;
      await Promise.all([
        screenVideo.play(),
        webcamVideo?.play() ?? Promise.resolve(),
        $reviewSessionStore.includeAudioTrack && audioEl ? audioEl.play() : Promise.resolve(),
      ]);
      startLoop();
      startSyncTimeLoop();
    } catch (e) {
      playing = false;
    }
  };

  const updateAudio = async () => {
    if (!assets) return;
    if (hasSegments()) return;
    if ($reviewSessionStore.includeAudioTrack) {
      if (!audioEl) {
        const url = await safeLoad(assets.audio ?? null);
        audioUrl = url;
        audioEl = url ? createAudioElement(url) : null;
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

  $: if (!playing && (snapshot !== undefined)) {
    drawFrame();
  }

  const pause = () => {
    playing = false;
    cancelAnimationFrame(animationId);
    screenVideo?.pause();
    webcamVideo?.pause();
    audioEl?.pause();
  };

  const clampToTimeline = (t: number) => Math.max(0, Math.min(duration || 0, t));

  const seek = (value: number) => {
    if (!screenVideo) return;
    const clamped = clampToTimeline(value);
    if (hasSegments()) {
      void setGlobalTime(clamped).then(() => {
        if (!playing) drawFrame();
      });
      return;
    }
    screenVideo.currentTime = clamped;
    if (webcamVideo) webcamVideo.currentTime = clamped;
    if (audioEl) audioEl.currentTime = clamped;
    currentTime = clamped;
  };

  let syncId: number;
  const startSyncTimeLoop = () => {
    cancelAnimationFrame(syncId);
    const epsilon = 0.02;
    const update = () => {
      if (!screenVideo) return;
      if (hasSegments() && activeSegment) {
        const local = screenVideo.currentTime;
        const effectiveLocal = Math.max(0, local - (activeSegment.trimStart / 1000));
        currentTime = activeSegmentStartSec + effectiveLocal;
      } else {
        currentTime = screenVideo.currentTime;
      }
      // Stop at end of timeline
      if (duration > 0 && currentTime >= duration - epsilon) {
        pause();
        currentTime = duration;
        if (hasSegments()) {
          void setGlobalTime(currentTime);
        } else {
          screenVideo.currentTime = currentTime;
          if (webcamVideo) webcamVideo.currentTime = currentTime;
          if (audioEl) audioEl.currentTime = currentTime;
        }
        drawFrame();
        return;
      }

      if (hasSegments() && activeSegment && segmentMediaById.size) {
        const localEnd = (activeSegment.duration - activeSegment.trimEnd) / 1000;
        if (screenVideo.currentTime >= localEnd - epsilon) {
          let nextIdx = activeSegmentIndex + 1;
          while (nextIdx < segments.length && !segmentMediaById.has(segments[nextIdx].id)) {
            nextIdx += 1;
          }
          if (nextIdx < segments.length && nextIdx !== activeSegmentIndex) {
            const nextStart = segmentStartsSec[nextIdx] ?? currentTime;
            void setGlobalTime(Math.max(nextStart, currentTime));
          } else {
            // Last playable segment: stop at its trim end
            pause();
            screenVideo.currentTime = localEnd;
            if (webcamVideo) webcamVideo.currentTime = localEnd;
            if (audioEl) audioEl.currentTime = localEnd;

            const effectiveEnd = duration > 0 ? duration : currentTime;
            currentTime = effectiveEnd;
            drawFrame();
            return;
          }
        }
      }
      if (playing) {
        syncId = requestAnimationFrame(update);
      }
    };
    syncId = requestAnimationFrame(update);
  };

  onMount(async () => {
    await loadAssets();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    pause();
  });
</script>

<div class="player-shell">
  <div class="video-frame">
    <canvas bind:this={canvasEl} />
  </div>

  <PlayerControls
    playing={playing}
    currentTime={currentTime}
    duration={duration}
    onPlay={play}
    onPause={pause}
    onSeek={seek}
  />
</div>

<style>
  .player-shell {
    display: flex;
    flex-direction: column;
    background: #0f172a;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
  }

  .video-frame {
    position: relative;
    width: 100%;
    background: #000;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
