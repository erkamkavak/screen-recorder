<script lang="ts">
  import {
    activeBackground,
    activeTheme,
    appView,
    canvasDimensions,
    generalLayoutState,
    lastRecording,
    recordingFPS,
    screenLayoutState,
    webcamLayoutState,
  } from "../stores";
  import type { PointerEventRecord, RecordingAsset } from "../stores";
  import Review from "./review/Review.svelte";
  import cursorPackCursor from "../assets/cursors/cutecore-pink-cursor.png?url";
  import cursorPackPointer from "../assets/cursors/cutecore-pink-pointer.png?url";
  import { timelineStore } from "../stores/timeline";
  import { onDestroy, onMount } from "svelte";
  import { backendAPI } from "../utils/backendAPI";
  import {
    render,
    isWebCodecsAvailable,
    type RenderOptions,
    type RenderResult,
  } from "../lib/rendering";
  import {
    computePointerState,
    getPointerRecords,
    type ComputedPointerState,
  } from "../utils/pointerState";
  import { ZOOM_DEFAULT_DURATION, ZOOM_DEFAULT_SCALE } from "../utils/zoomDefaults";
  import { calculateScreenPlacement } from "../utils/layoutDrawers";
  import type { ScreenPlacement } from "../utils/layoutDrawers";
  import { findZoomEventForTime } from "../utils/zoomEvents";

  let videoDuration = 0;
  let videoCurrentTime = 0;
  let isRenderingVideo = false;
  let renderProgress = 0;

  let includePointerTrack = true;
  let includeWebcamTrack = true;
  let includeAudioTrack = true;

  let playerFrameEl: HTMLDivElement | null = null;
  let videoFrameWidth = 0;
  let videoFrameHeight = 0;
  let videoFrameOffsetLeft = 0;
  let videoFrameOffsetTop = 0;
  let frameObserver: ResizeObserver | null = null;
  type PointerIconOption = {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
  };
  let pointerState: ComputedPointerState = {
    x: 0.5,
    y: 0.5,
    visible: false,
    kind: null,
    isPressed: false,
    cursorShape: "default",
  };
  const POINTER_COLOR = "#f97316";
  let pointerIndicatorSize = 18;
  let pointerIconSelection = "cutecore-pink";
  let pointerIconUrl: string | null = null;
  let pointerIconPressedUrl: string | null = null;
  let pointerIconImageUrl: string | null = null;
  let pointerIconPressedImageUrl: string | null = null;
  let pointerShadow = "rgba(249, 115, 22, 0.4)";
  let screenPlacement: ScreenPlacement | null = null;
  let pointerStyle = "opacity: 0;";
  let recordingDurationSeconds = 0;
  let timelineDuration = 0;
  let recordedScreenWidth = 0;
  let recordedScreenHeight = 0;
  type RenderFormat = "mp4" | "webm";
  type RenderFormatOption = {
    value: RenderFormat;
    label: string;
    supported: boolean;
  };
  const baseRenderFormatOptions: Array<{ value: RenderFormat; label: string }> = [
    { value: "mp4", label: "MP4 (H.264)" },
    { value: "webm", label: "WebM (VP9)" },
  ];
  let renderFormat: RenderFormat = "mp4";
  let supportedRenderFormats: Record<RenderFormat, boolean> = { mp4: true, webm: true };
  let renderFormatOptions: RenderFormatOption[] = [];
  $: renderFormatOptions = baseRenderFormatOptions.map((option) => ({
    value: option.value,
    label: option.label,
    supported: supportedRenderFormats[option.value],
  }));
  type ResolutionPresetId = "scale-100" | "scale-75" | "scale-50";
  type ResolutionPreset = { id: ResolutionPresetId; label: string; scale: number };
  const baseResolutionPresets: Omit<ResolutionPreset, "label">[] = [
    { id: "scale-100", scale: 1 },
    { id: "scale-75", scale: 0.75 },
    { id: "scale-50", scale: 0.5 },
  ];
  let selectedResolutionPreset: ResolutionPresetId = "scale-100";
  $: resolutionPresets = baseResolutionPresets.map((preset) => {
    const scaledWidth = Math.max(2, Math.round($canvasDimensions.width * preset.scale));
    const scaledHeight = Math.max(2, Math.round($canvasDimensions.height * preset.scale));
    const suffix = preset.scale === 1 ? "(100%)" : preset.scale === 0.75 ? "(75%)" : "(50%)";
    return {
      id: preset.id,
      scale: preset.scale,
      label: `${scaledWidth} × ${scaledHeight} ${suffix}`,
    } satisfies ResolutionPreset;
  });

  type FrameRatePresetId = "fps-original" | "fps-60" | "fps-30";
  type FrameRatePreset = { id: FrameRatePresetId; label: string; fps: number | "original" };
  const frameRatePresets: FrameRatePreset[] = [
    { id: "fps-original", label: "Original", fps: "original" },
    { id: "fps-60", label: "60 fps", fps: 60 },
    { id: "fps-30", label: "30 fps", fps: 30 },
  ];
  let selectedFrameRatePreset: FrameRatePresetId = "fps-original";
  
  let currentSnapshot = timelineStore.snapshot();
  // Reactive snapshot so zoom/trim changes reflect in composited preview
  $: ($timelineStore, currentSnapshot = timelineStore.snapshot());

  const updateVideoFrameMetrics = () => {
    if (!playerFrameEl) {
      videoFrameWidth = 0;
      videoFrameHeight = 0;
      videoFrameOffsetLeft = 0;
      videoFrameOffsetTop = 0;
      return;
    }
    const videoFrameEl = playerFrameEl.querySelector<HTMLElement>(".video-frame");
    if (!videoFrameEl) {
      videoFrameWidth = 0;
      videoFrameHeight = 0;
      videoFrameOffsetLeft = 0;
      videoFrameOffsetTop = 0;
      return;
    }
    const playerRect = playerFrameEl.getBoundingClientRect();
    const videoRect = videoFrameEl.getBoundingClientRect();
    videoFrameWidth = videoRect.width;
    videoFrameHeight = videoRect.height;
    videoFrameOffsetLeft = videoRect.left - playerRect.left;
    videoFrameOffsetTop = videoRect.top - playerRect.top;
  };

  const observeVideoFrame = () => {
    frameObserver?.disconnect();
    if (!playerFrameEl) return;
    frameObserver = new ResizeObserver(updateVideoFrameMetrics);
    frameObserver.observe(playerFrameEl);
    const videoFrameEl = playerFrameEl.querySelector<HTMLElement>(".video-frame");
    if (videoFrameEl) {
      frameObserver.observe(videoFrameEl);
    }
    updateVideoFrameMetrics();
  };

  onMount(() => {
    updateVideoFrameMetrics();
    window.addEventListener("resize", updateVideoFrameMetrics);
    return () => window.removeEventListener("resize", updateVideoFrameMetrics);
  });

  onMount(() => {
    const supportsType = (type: string) => {
      if (typeof MediaRecorder === "undefined") return false;
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    };
    supportedRenderFormats = {
      mp4: supportsType("video/mp4;codecs=h264") || supportsType("video/mp4"),
      webm: supportsType("video/webm;codecs=vp9") || supportsType("video/webm"),
    };
    if (!supportedRenderFormats[renderFormat]) {
      renderFormat = supportedRenderFormats.mp4
        ? "mp4"
        : supportedRenderFormats.webm
        ? "webm"
        : renderFormat;
    }
  });

  $: if (playerFrameEl) {
    observeVideoFrame();
  } else {
    frameObserver?.disconnect();
    frameObserver = null;
  }

  onDestroy(() => {
    frameObserver?.disconnect();
    timelineStore.reset();
  });

  let pointerRecords: PointerEventRecord[] = [];
  $: pointerRecords = getPointerRecords($lastRecording?.events);
  $: pointerState = computePointerState(videoCurrentTime, pointerRecords);

  $: recordingDurationSeconds = $lastRecording ? Math.max(0, $lastRecording.duration / 1000) : 0;
  $: timelineDuration = videoDuration > 0 ? videoDuration : recordingDurationSeconds;

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const clampToTimelineDuration = (value: number) => {
    const duration = Math.max(timelineDuration, 0);
    return Math.max(0, Math.min(value, duration));
  };

  const handleRenderFormatChange = (format: RenderFormat) => {
    renderFormat = format;
  };

  const handleResolutionPresetChange = (id: ResolutionPresetId) => {
    selectedResolutionPreset = id;
  };

  const handleFrameRatePresetChange = (id: FrameRatePresetId) => {
    selectedFrameRatePreset = id;
  };

  const hexToRgba = (hex: string, alpha = 1) => {
    let normalized = hex?.trim()?.replace(/^#/, "") ?? "";
    if (normalized.length === 3) {
      normalized = normalized
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (normalized.length !== 6) {
      return `rgba(249, 115, 22, ${alpha})`;
    }
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some((component) => Number.isNaN(component))) {
      return `rgba(249, 115, 22, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const builtinPointerIconOptions: PointerIconOption[] = [
    {
      id: "cutecore-pink",
      label: "Cutecore Pink",
      data: `url("${cursorPackCursor}")`,
      pressedData: `url("${cursorPackPointer}")`,
    },
  ];

  let zipPointerIconOptions: PointerIconOption[] = [];
  let pointerIconOptions: PointerIconOption[] = builtinPointerIconOptions;
  let pointerIconOptionMap = new Map<string, PointerIconOption>();
  let zipPointerImportMessage = "";

  const supportedImageExtensions = new Set(["png", "svg", "webp", "jpg", "jpeg", "gif"]);

  const getExtension = (name: string) => {
    const match = name.toLowerCase().match(/\.([a-z0-9]+)$/i);
    return match ? match[1] : "";
  };

  const getMimeTypeForExtension = (ext: string) => {
    switch (ext) {
      case "png":
        return "image/png";
      case "svg":
        return "image/svg+xml";
      case "webp":
        return "image/webp";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "gif":
        return "image/gif";
      default:
        return null;
    }
  };

  const arrayBufferToBase64 = (data: Uint8Array) => {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < data.length; i += chunkSize) {
      const slice = data.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...slice);
    }
    return btoa(binary);
  };

  type ZipEntry = {
    name: string;
    compression: number;
    compressedSize: number;
    uncompressedSize: number;
    dataOffset: number;
  };

  const parseZipEntries = (buffer: ArrayBuffer) => {
    const entries: ZipEntry[] = [];
    const view = new DataView(buffer);
    const decoder = new TextDecoder("utf-8");
    const total = buffer.byteLength;
    let offset = 0;

    while (offset + 30 <= total) {
      const signature = view.getUint32(offset, true);
      if (signature !== 0x04034b50) break;
      const compressedSize = view.getUint32(offset + 18, true);
      const uncompressedSize = view.getUint32(offset + 22, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      if (nameStart + nameLen > total) break;
      const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLen));
      const dataOffset = nameStart + nameLen + extraLen;
      if (dataOffset + compressedSize > total) break;
      const compression = view.getUint16(offset + 8, true);

      entries.push({
        name,
        compression,
        compressedSize,
        uncompressedSize,
        dataOffset,
      });

      offset = dataOffset + compressedSize;
    }

    return entries;
  };

  const decompressZipEntry = async (entry: ZipEntry, buffer: ArrayBuffer) => {
    if (entry.dataOffset + entry.compressedSize > buffer.byteLength) {
      throw new Error("ZIP entry appears truncated");
    }
    const compressedData = new Uint8Array(buffer, entry.dataOffset, entry.compressedSize);
    if (entry.compression === 0) {
      return compressedData;
    }
    if (entry.compression === 8) {
      const DSConstructor = (globalThis as typeof globalThis & {
        DecompressionStream?: new (
          format: string
        ) => {
          readable: ReadableStream<Uint8Array>;
          writable: WritableStream<Uint8Array>;
        };
      }).DecompressionStream;
      if (!DSConstructor) {
        throw new Error("DecompressionStream is not supported in this environment");
      }
      const ds = new DSConstructor("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(compressedData);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.byteLength;
        }
      }
      const result = new Uint8Array(total);
      let cursor = 0;
      for (const chunk of chunks) {
        result.set(chunk, cursor);
        cursor += chunk.byteLength;
      }
      return result;
    }
    throw new Error(`Unsupported ZIP compression format: ${entry.compression}`);
  };

  const sanitizeIdSegment = (value: string) =>
    value
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "")
      .toLowerCase();

  const handleZipPointerFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    let message = "";
    try {
      const buffer = await file.arrayBuffer();
      const entries = parseZipEntries(buffer);
      if (!entries.length) {
        message = "No supported pointer images were found inside this zip.";
        zipPointerImportMessage = message;
        return;
      }

      type PackCandidate = {
        id: string;
        label: string;
        cursorEntry?: ZipEntry;
        pointerEntry?: ZipEntry;
      };

      const baseFileName = file.name.replace(/\.[^.]+$/, "");
      const packMap = new Map<string, PackCandidate>();

      const normalizeEntryName = (entryName: string) =>
        entryName.split("/").pop() ?? entryName;

      const buildPackLabel = (name: string) => {
        const trimmed = name.replace(/\.[^.]+$/, "").replace(/--(cursor|pointer).*/i, "").trim();
        return trimmed || baseFileName;
      };

      for (const entry of entries) {
        if (entry.name.endsWith("/")) continue;
        const ext = getExtension(entry.name);
        if (!supportedImageExtensions.has(ext)) continue;

        const cleanedName = normalizeEntryName(entry.name);
        const label = buildPackLabel(cleanedName);
        const keyBase = sanitizeIdSegment(label) || sanitizeIdSegment(baseFileName) || `cursor-pack`;
        const existing = packMap.get(keyBase);
        const pack: PackCandidate = existing ?? { id: keyBase, label };

        const normalized = cleanedName.toLowerCase();
        if (normalized.includes("pointer")) {
          pack.pointerEntry = pack.pointerEntry ?? entry;
        } else {
          pack.cursorEntry = pack.cursorEntry ?? entry;
        }
        packMap.set(keyBase, pack);
      }

      if (!packMap.size) {
        message = "No supported pointer images were found inside this zip.";
        zipPointerImportMessage = message;
        return;
      }

      const existingZipCount = zipPointerIconOptions.length;
      const loadedOptions: PointerIconOption[] = [];
      let packIndex = 0;

      for (const pack of packMap.values()) {
        const cursorEntry = pack.cursorEntry ?? pack.pointerEntry;
        if (!cursorEntry) continue;
        const cursorMime = getMimeTypeForExtension(getExtension(cursorEntry.name));
        if (!cursorMime) continue;

        const cursorData = await decompressZipEntry(cursorEntry, buffer);
        const cursorBase64 = arrayBufferToBase64(cursorData);
        const cursorDataUrl = `data:${cursorMime};base64,${cursorBase64}`;

        let pressedDataUrl = cursorDataUrl;
        if (pack.pointerEntry) {
          const pointerMime = getMimeTypeForExtension(getExtension(pack.pointerEntry.name));
          if (pointerMime) {
            const pointerData = await decompressZipEntry(pack.pointerEntry, buffer);
            const pointerBase64 = arrayBufferToBase64(pointerData);
            pressedDataUrl = `data:${pointerMime};base64,${pointerBase64}`;
          }
        }

        const optionIdBase = sanitizeIdSegment(`${pack.label}-${file.name}`) || `cursor-pack-${packIndex}`;
        loadedOptions.push({
          id: `${optionIdBase}-${existingZipCount + packIndex}`,
          label: pack.label,
          data: `url("${cursorDataUrl}")`,
          pressedData: `url("${pressedDataUrl}")`,
        });
        packIndex += 1;
      }

      zipPointerIconOptions = [...zipPointerIconOptions, ...loadedOptions];
      if (loadedOptions.length > 0) {
        pointerIconSelection = loadedOptions[0].id;
        message = `Imported ${loadedOptions.length} pack${loadedOptions.length === 1 ? "" : "s"} from ${file.name}.`;
      } else {
        message = "No supported pointer images were found inside this zip.";
      }
    } catch (error) {
      console.error("Failed to import pointer pack", error);
      message = "Unable to extract pointer images from this zip file.";
    } finally {
      input.value = "";
      zipPointerImportMessage = message;
    }
  };

  $: pointerIconOptions = [...builtinPointerIconOptions, ...zipPointerIconOptions];

  $: pointerIconOptionMap = new Map(pointerIconOptions.map((option) => [option.id, option]));

  $: if (!pointerIconOptionMap.has(pointerIconSelection)) {
    pointerIconSelection = builtinPointerIconOptions[0]?.id ?? "cutecore-pink";
  }

  $: {
    const option = pointerIconOptionMap.get(pointerIconSelection);
    pointerIconUrl = option?.data ?? null;
    pointerIconPressedUrl = option?.pressedData ?? option?.data ?? null;

    const unwrapCssUrl = (value: string | null): string | null => {
      if (!value) return null;
      let v = value.trim();

      // Strip outer url(...) wrapper if present
      if (v.startsWith("url(") && v.endsWith(")")) {
        v = v.slice(4, -1).trim();
      }

      // Strip matching leading/trailing quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1).trim();
      }

      // Defensive: remove any stray trailing quote that slipped through
      if (v.endsWith('"') || v.endsWith("'")) {
        v = v.slice(0, -1).trim();
      }

      return v;
    };

    pointerIconImageUrl = unwrapCssUrl(pointerIconUrl);
    pointerIconPressedImageUrl = unwrapCssUrl(pointerIconPressedUrl);
  }

  const updatePointerIconSelection = (selection: string) => {
    if (!pointerIconOptionMap.has(selection)) return;
    pointerIconSelection = selection;
  };

  // Create a fake share object with recorded screen dimensions for placement calculation
  $: recordedShare = recordedScreenWidth > 0 && recordedScreenHeight > 0
    ? { id: "recorded", width: recordedScreenWidth, height: recordedScreenHeight, preview: {} as HTMLVideoElement }
    : null;
  
  $: screenPlacement = calculateScreenPlacement(
    $canvasDimensions,
    recordedShare,
    $screenLayoutState,
    $generalLayoutState
  );

  $: {
    const canvasWidth = $canvasDimensions.width || 1;
    const canvasHeight = $canvasDimensions.height || 1;
    const scaleX = canvasWidth ? videoFrameWidth / canvasWidth : 0;
    const scaleY = canvasHeight ? videoFrameHeight / canvasHeight : 0;
    const placementX = screenPlacement
      ? screenPlacement.x + pointerState.x * screenPlacement.width
      : pointerState.x * canvasWidth;
    const placementY = screenPlacement
      ? screenPlacement.y + pointerState.y * screenPlacement.height
      : pointerState.y * canvasHeight;

    pointerShadow = hexToRgba(POINTER_COLOR, 0.45);

    const pointerLeft = videoFrameOffsetLeft + placementX * scaleX;
    const pointerTop = videoFrameOffsetTop + placementY * scaleY;
    
    const cursorShape = pointerState.cursorShape || "default";
    const usePointerIcon = cursorShape === "pointer" || pointerState.isPressed;
    const pointerSourceIcon = usePointerIcon
      ? pointerIconPressedUrl ?? pointerIconUrl
      : pointerIconUrl;
    const pointerHasIcon = Boolean(pointerSourceIcon);
    const pointerBackground = pointerHasIcon ? "transparent" : POINTER_COLOR;
    const pointerBorderRadius = pointerHasIcon ? "4px" : "999px";

    const pointerShouldShow =
      includePointerTrack &&
      pointerState.visible &&
      videoFrameWidth > 0 &&
      videoFrameHeight > 0 &&
      scaleX > 0 &&
      scaleY > 0;

    pointerStyle = pointerShouldShow
      ? `left: ${pointerLeft}px; top: ${pointerTop}px; opacity: 1; --pointer-size: ${pointerIndicatorSize}px; --pointer-color: ${POINTER_COLOR}; --pointer-shadow: ${pointerShadow}; --pointer-icon: ${
          pointerSourceIcon ?? "none"
        }; --pointer-background: ${pointerBackground}; --pointer-border-radius: ${pointerBorderRadius}; --cursor-shape: ${cursorShape};`
      : "opacity: 0;";
  }

  const updatePointerSize = (value: number) => {
    pointerIndicatorSize = clamp(value, 6, 64);
  };

  $: clickEvents = $lastRecording
    ? ($lastRecording.events.filter((event) => event.kind === "click") as PointerEventRecord[])
    : [];
  $: sortedClickEvents = [...clickEvents].sort((a, b) => a.t - b.t);

  const addZoomForClick = (clickEvent: PointerEventRecord, seconds?: number) => {
    const duration = Math.max(timelineDuration, 0);
    if (duration <= 0) return;

    const timestampSeconds = clampToTimelineDuration(seconds ?? clickEvent.t / 1000);
    const existingZoom = findZoomEventForTime($timelineStore.events, timestampSeconds);
    if (existingZoom) {
      timelineStore.selectEvent(existingZoom.id);
      return;
    }

    const focusX = typeof clickEvent.x === "number" ? clickEvent.x : 0.5;
    const focusY = typeof clickEvent.y === "number" ? clickEvent.y : 0.5;
    const startTime = clampToTimelineDuration(timestampSeconds - ZOOM_DEFAULT_DURATION / 2);

    timelineStore.addZoom({
      startTime,
      duration: ZOOM_DEFAULT_DURATION,
      focusX,
      focusY,
      zoom: ZOOM_DEFAULT_SCALE,
      label: "Click zoom",
    });
  };

  const resetToRecorder = () => {
    $appView = "recorder";
  };

  const getExportScale = (): number => {
    const preset = resolutionPresets.find((p) => p.id === selectedResolutionPreset);
    return preset?.scale ?? 1;
  };

  const getExportCanvasSize = () => {
    const scale = getExportScale();
    const width = Math.max(2, Math.round($canvasDimensions.width * scale));
    const height = Math.max(2, Math.round($canvasDimensions.height * scale));
    return {
      title: $canvasDimensions.title,
      width,
      height,
    };
  };

  const getExportFrameRate = () => {
    const preset = frameRatePresets.find((p) => p.id === selectedFrameRatePreset);
    if (!preset || preset.fps === "original") {
      return $recordingFPS || 30;
    }
    return preset.fps;
  };

  const isMp4Asset = (asset?: RecordingAsset | null): boolean => {
    if (!asset) return false;
    const mime = asset.mimeType?.toLowerCase() ?? "";
    if (mime.startsWith("video/mp4") || mime.includes("avc") || mime.includes("h264")) {
      return true;
    }
    const extension = asset.fileName.split(".").pop()?.toLowerCase();
    return extension === "mp4";
  };

  let currentCancelToken: { cancelled: boolean } | null = null;

  const cancelCurrentRender = () => {
    if (currentCancelToken) {
      currentCancelToken.cancelled = true;
    }
  };

  const downloadEditedVideo = async () => {
    if (!$lastRecording) return;
    if (isRenderingVideo) return;
    isRenderingVideo = true;
    renderProgress = 0;

    if (currentCancelToken) {
      currentCancelToken.cancelled = true;
    }
    currentCancelToken = { cancelled: false };

    const recordingBaseName = $lastRecording.fileName
      ? $lastRecording.fileName.replace(/\.[^.]+$/, "")
      : "recording";
    const getDownloadName = (ext: string) => `edited-${recordingBaseName}.${ext}`;

    try {
      // Check WebCodecs availability
      if (!isWebCodecsAvailable()) {
        throw new Error("WebCodecs API is not available in this browser. Please use a modern browser like Chrome or Edge.");
      }

      console.log("[Render] Using WebCodecs for MP4 output");
      
      let result: RenderResult;
      
      try {
        result = await render(
          $lastRecording.assets,
          $lastRecording.duration,
          timelineStore.snapshot(),
          {
            frameRate: getExportFrameRate(),
            canvasSize: getExportCanvasSize(),
            generalLayoutState: $generalLayoutState,
            screenLayoutState: $screenLayoutState,
            webcamLayoutState: $webcamLayoutState,
            theme: $activeTheme,
            background: $activeBackground,
            toggles: {
              showScreen: true,
              showWebcam: includeWebcamTrack,
              showMouse: includePointerTrack,
              includeAudio: includeAudioTrack,
            },
            pointerRecords,
            pointerIconUrl: pointerIconImageUrl,
            pointerIconPressedUrl: pointerIconPressedImageUrl,
            pointerSize: pointerIndicatorSize,
            cancelToken: currentCancelToken!,
            onProgress: (current, total) => {
              renderProgress = Math.round((current / total) * 100);
            },
          }
        );
      } catch (error) {
        if (error instanceof Error && error.message === "Render cancelled") {
          console.log("[Render] Render cancelled");
          return;
        }
        throw error;
      }

      // Handle blob result (WebCodecs or MediaRecorder)
      if (result && "blob" in result) {
        const url = URL.createObjectURL(result.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = getDownloadName(result.ext ?? "mp4");
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          anchor.remove();
        }, 1000);
      } else if (result && result.type === "file") {
        // Handle file result (legacy path)
        const savedPath = await backendAPI.saveRenderedFile(
          result.filePath,
          getDownloadName(result.ext ?? "mp4")
        );
        if (!savedPath) {
          console.warn("Rendered file save cancelled");
          return;
        }
      }
    } catch (error) {
      console.error("Failed to render edited video", error);
    } finally {
      isRenderingVideo = false;
      renderProgress = 0;
      currentCancelToken = null;
    }
  };

</script>

<Review
  bind:playerFrameEl={playerFrameEl}
  lastRecording={$lastRecording}
  assets={$lastRecording?.assets ?? null}
  canvasSize={$canvasDimensions}
  generalLayoutState={$generalLayoutState}
  screenLayoutState={$screenLayoutState}
  webcamLayoutState={$webcamLayoutState}
  theme={$activeTheme}
  background={$activeBackground}
  timelineDuration={timelineDuration}
  recordingFPS={$recordingFPS}
  currentSnapshot={currentSnapshot}
  bind:includePointerTrack={includePointerTrack}
  bind:includeWebcamTrack={includeWebcamTrack}
  bind:includeAudioTrack={includeAudioTrack}
  {pointerStyle}
  pointerSize={pointerIndicatorSize}
  pointerIconSelection={pointerIconSelection}
  pointerIconOptions={pointerIconOptions}
  onPointerSizeChange={updatePointerSize}
  onPointerIconSelect={updatePointerIconSelection}
  zipPointerImportMessage={zipPointerImportMessage}
  onZipPointerFileChange={handleZipPointerFile}
  {clickEvents}
  {sortedClickEvents}
  {pointerRecords}
  {pointerIconImageUrl}
  {pointerIconPressedImageUrl}
  {pointerIndicatorSize}
  bind:videoDuration={videoDuration}
  bind:videoCurrentTime={videoCurrentTime}
  bind:screenWidth={recordedScreenWidth}
  bind:screenHeight={recordedScreenHeight}
  {isRenderingVideo}
  {renderProgress}
  {downloadEditedVideo}
  onCancelRender={cancelCurrentRender}
  {resetToRecorder}
  {addZoomForClick}
  renderFormat={renderFormat}
  renderFormatOptions={renderFormatOptions}
  onRenderFormatChange={handleRenderFormatChange}
  resolutionPresets={resolutionPresets}
  selectedResolutionPreset={selectedResolutionPreset}
  onResolutionPresetChange={handleResolutionPresetChange}
  frameRatePresets={frameRatePresets}
  selectedFrameRatePreset={selectedFrameRatePreset}
  onFrameRatePresetChange={handleFrameRatePresetChange}
/>
