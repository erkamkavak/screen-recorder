import { get } from "svelte/store";
import {
  appView,
  inputEvents,
  lastRecording,
  recordingFPS,
  recordingStartTime,
  displayStream,
  webcamState,
  micState,
  activeShare,
  type RecordingAssetType,
  type RecordingAssets,
  type LastRecording,
  type PointerEventRecord,
} from "../stores";
import { patchBlob } from "../utils/blobHelpers";
import { getPreferredMimeType } from "../utils/getPreferredMimeType";
import { backendAPI, type NativeMouseEvent } from "../utils/backendAPI";

// Types for per-asset recording
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

const revokeRecordingAssets = async (recording: LastRecording) => {
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

    if (nativeRecordingFilePath) {
      assets.screen = {
        type: "screen",
        fileName: "screen.webm",
        filePath: nativeRecordingFilePath,
        mimeType: "video/webm",
      };
      nativeRecordingFilePath = null;
    }

    const previousRecording = get(lastRecording);
    await revokeRecordingAssets(previousRecording);

    const previewAsset = assets.screen ?? assets.webcam ?? null;
    lastRecording.set({
      assets,
      events: get(inputEvents),
      duration: durationMs,
      fileName: `recording.${fileExtension}`,
      previewPath: previewAsset?.filePath,
    });

    appView.set("review");
  } catch (error) {
    console.error("Failed to finalize recording", error);
  } finally {
    recorders.forEach(({ stream }) =>
      stream.getTracks().forEach((track) => track.stop())
    );
  }
};

const mapNativeMouseEventsToPointerRecords = (
  nativeMouseEvents: NativeMouseEvent[]
): PointerEventRecord[] => {
  const pointerRecords: PointerEventRecord[] = nativeMouseEvents.map((e) => {
    let kind: PointerEventRecord["kind"] = "pointermove";
    let button = 0;

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
  pointerRecords.sort((a, b) => a.t - b.t);

  // Synthesize click events at pointer-down so the review timeline can display them
  const enrichedRecords: PointerEventRecord[] = [...pointerRecords];
  for (const event of pointerRecords) {
    if (event.kind === "pointerdown") {
      enrichedRecords.push({
        kind: "click",
        t: event.t,
        x: event.x,
        y: event.y,
        button: event.button,
      });
    }
  }

  enrichedRecords.sort((a, b) => a.t - b.t);
  return enrichedRecords;
};

const startNativeScreenRecording = async (
  display: MediaStream | null,
  fps: number | null
) => {
  if (!display?.getTracks().length) return;

  try {
    const activeShareData = get(activeShare);
    const targetId = activeShareData?.id || "monitor:0";
    const captureType = targetId.startsWith("window:") ? "window" : "monitor";

    nativeRecordingFilePath = await backendAPI.startNativeRecording({
      targetId,
      captureType,
      includeCursor: false,
      frameRate: fps || 30,
      fileName: `screen.webm`,
    });
  } catch (error) {
    console.error("Failed to start native recording:", error);
    throw error;
  }
};

const collectMediaRecorders = (
  videoMime: { mimeType: string; ext: string }
): AssetRecorderState[] => {
  const webcam = get(webcamState);
  const mic = get(micState);
  const assetsToCapture: {
    type: RecordingAssetType;
    stream: MediaStream;
    options: MediaRecorderOptions;
    fileName: string;
  }[] = [];

  if (canUseMediaRecorder && webcam.stream?.getTracks().length) {
    assetsToCapture.push({
      type: "webcam",
      stream: cloneStream(webcam.stream),
      options: {
        mimeType: videoMime.mimeType,
        videoBitsPerSecond: 4 * 1000 * 1000,
      },
      fileName: `webcam.${videoMime.ext}`,
    });
  }

  if (canUseMediaRecorder && mic.stream?.getTracks().length) {
    assetsToCapture.push({
      type: "audio",
      stream: cloneStream(mic.stream),
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

  return recorders;
};

const beginRecordingSession = (recorders: AssetRecorderState[]) => {
  if (!nativeRecordingFilePath && !recorders.length) {
    recorders.forEach(({ stream }) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    return;
  }

  currentAssetRecorders = recorders;
  recordingStartTime.set(performance.now());
  inputEvents.set([]);
  appView.set("recorder");
};

export const startRecording = async () => {
  const videoMime = getPreferredMimeType();
  recordingFileExtension = videoMime.ext;
  const $displayStream = get(displayStream);
  const $recordingFPS = get(recordingFPS);

  if ($displayStream?.getTracks().length) {
    try {
      await startNativeScreenRecording($displayStream, $recordingFPS);
    } catch {
      return;
    }
  }

  const recorders = collectMediaRecorders(videoMime);
  beginRecordingSession(recorders);
};

export const stopRecording = async () => {
  if (nativeRecordingFilePath) {
    try {
      await backendAPI.stopNativeRecording();

      try {
        const nativeMouseEvents = await backendAPI.getRecordingMouseEvents();
        if (nativeMouseEvents?.length) {
          const pointerRecords = mapNativeMouseEventsToPointerRecords(nativeMouseEvents);
          inputEvents.set(pointerRecords);

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
    recordingStartTime.set(null);
    return;
  }

  const startTime = get(recordingStartTime) ?? performance.now();
  const durationMs = performance.now() - startTime;
  recordingStartTime.set(null);

  const recordersToFinalize = currentAssetRecorders.slice();
  currentAssetRecorders = [];

  recordersToFinalize.forEach(({ recorder }) => {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  });

  void finalizeRecordingAssets(durationMs, recordersToFinalize, recordingFileExtension);
};
