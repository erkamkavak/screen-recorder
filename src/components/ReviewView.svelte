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
  import type { PointerEventRecord } from "../stores";
  import Review from "./review/Review.svelte";
  import cursorPackCursor from "../assets/cursors/cutecore-pink-cursor.png?url";
  import cursorPackPointer from "../assets/cursors/cutecore-pink-pointer.png?url";
  import { timelineStore } from "../stores/timeline";
  import { onDestroy, onMount } from "svelte";
  import { backendAPI } from "../utils/backendAPI";
  import {
    renderCompositeRecording,
    type RenderCompositeOptions,
    type RenderResult,
  } from "../utils/renderEditedRecording";
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
  $: timelineDuration = videoDuration;

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const clampToTimelineDuration = (value: number) => {
    const duration = Math.max(timelineDuration, 0);
    return Math.max(0, Math.min(value, duration));
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
    const pointerSourceIcon = pointerState.isPressed
      ? pointerIconPressedUrl ?? pointerIconUrl
      : pointerIconUrl;
    const pointerHasIcon = Boolean(pointerSourceIcon);
    const pointerBackground = pointerHasIcon ? "transparent" : POINTER_COLOR;
    const pointerBorderRadius = pointerHasIcon ? "4px" : "999px";

    const pointerShouldShow =
      includePointerTrack &&
      pointerState.kind !== null &&
      videoFrameWidth > 0 &&
      videoFrameHeight > 0 &&
      scaleX > 0 &&
      scaleY > 0;

    pointerStyle = pointerShouldShow
      ? `left: ${pointerLeft}px; top: ${pointerTop}px; opacity: 1; --pointer-size: ${clamp(
          pointerIndicatorSize,
          6,
          64
        )}px; --pointer-color: ${POINTER_COLOR}; --pointer-shadow: ${pointerShadow}; --pointer-icon: ${
          pointerSourceIcon ?? "none"
        }; --pointer-background: ${pointerBackground}; --pointer-border-radius: ${pointerBorderRadius};`
      : "opacity: 0;";
  }

  const updatePointerSize = (value: number) => {
    pointerIndicatorSize = clamp(value, 6, 64);
  };

  $: clickEvents = $lastRecording
    ? ($lastRecording.events.filter((event) => event.kind === "click" || event.kind === "pointerdown") as PointerEventRecord[])
    : [];
  $: sortedClickEvents = [...clickEvents].sort((a, b) => a.t - b.t);

  const addZoomForClick = (clickEvent: PointerEventRecord) => {
    const duration = Math.max(timelineDuration, 0);
    if (duration <= 0) return;

    const timestampSeconds = clampToTimelineDuration(clickEvent.t / 1000);
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

  const buildRenderOptions = (onProgress?: (current: number, end: number) => void): RenderCompositeOptions => ({
    canvasSize: $canvasDimensions,
    generalLayoutState: $generalLayoutState,
    screenLayoutState: $screenLayoutState,
    webcamLayoutState: $webcamLayoutState,
    theme: $activeTheme,
    background: $activeBackground,
    frameRate: $recordingFPS,
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
    onProgress,
  });

  const downloadEditedVideo = async () => {
    if (!$lastRecording) return;
    isRenderingVideo = true;
    renderProgress = 0;

    let cleanupPath: string | null = null;
    try {
      const result: RenderResult = await renderCompositeRecording(
        $lastRecording.assets,
        $lastRecording.duration,
        timelineStore.snapshot(),
        buildRenderOptions((current, end) => {
          renderProgress = end ? Math.min(100, Math.round((current / end) * 100)) : 0;
        })
      );

      if (result.type === "file") {
        cleanupPath = result.filePath;
        const savedPath = await backendAPI.saveRenderedFile(
          result.filePath,
          `edited-${$lastRecording.fileName}`
        );
        if (!savedPath) {
          console.warn("Rendered file save cancelled");
          return;
        }
        return;
      }

      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `edited-${$lastRecording.fileName}`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        anchor.remove();
      }, 1000);
    } catch (error) {
      console.error("Failed to render edited video", error);
    } finally {
      isRenderingVideo = false;
      renderProgress = 0;
      if (cleanupPath) {
        await backendAPI.cleanupRecordingAssets([cleanupPath]);
      }
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
  bind:videoDuration={videoDuration}
  bind:videoCurrentTime={videoCurrentTime}
  bind:screenWidth={recordedScreenWidth}
  bind:screenHeight={recordedScreenHeight}
  {isRenderingVideo}
  {renderProgress}
  {downloadEditedVideo}
  {resetToRecorder}
  {addZoomForClick}
/>
