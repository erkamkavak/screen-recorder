import type { InputEventRecord, LastRecording, RecordingAssets, RecordingProject, RecordingSegment } from "../stores";
import type { AssetRecorderState, RecordingBackend } from "./recordingController.types";

const toGlobalEvents = (segments: RecordingSegment[]): InputEventRecord[] => {
  const out: InputEventRecord[] = [];
  for (const segment of segments) {
    const localStart = Math.max(0, segment.trimStart);
    const localEnd = Math.max(localStart, segment.duration - Math.max(0, segment.trimEnd));
    for (const event of segment.events) {
      if (typeof event.t !== "number") continue;
      if (event.t < localStart || event.t > localEnd) continue;
      out.push({
        ...event,
        t: (event.t - localStart) + segment.startOffset,
      } as InputEventRecord);
    }
  }
  return out;
};

const saveAssetToStorage = async (
  backendAPI: RecordingBackend,
  blob: Blob,
  fileName: string
): Promise<string> => {
  try {
    const buffer = await blob.arrayBuffer();
    return await backendAPI.saveRecordingAsset(fileName, buffer);
  } catch {
    return URL.createObjectURL(blob);
  }
};

const cleanupAssetPaths = async (backendAPI: RecordingBackend, paths: string[]) => {
  if (!paths.length) return;
  try {
    await backendAPI.cleanupRecordingAssets(paths);
  } catch {
    // browser fallback
  }
};

const revokeRecordingAssets = async (backendAPI: RecordingBackend, recording: LastRecording) => {
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

  await cleanupAssetPaths(backendAPI, filePaths);
};

const buildRecordingResult = (args: {
  assets: RecordingAssets;
  inputEvents: InputEventRecord[];
  durationMs: number;
  fileExtension: string;
  existingProject?: RecordingProject | null;
}): LastRecording => {
  const { assets, inputEvents, durationMs, fileExtension, existingProject } = args;

  if (existingProject && existingProject.segments.length > 0) {
    const existingDuration = existingProject.segments.reduce(
      (sum, seg) => sum + (seg.duration - seg.trimStart - seg.trimEnd),
      0
    );

    const newSegment: RecordingSegment = {
      id: crypto.randomUUID(),
      assets,
      events: inputEvents,
      startOffset: existingDuration,
      duration: durationMs,
      trimStart: 0,
      trimEnd: 0,
    };

    const allSegments = [...existingProject.segments, newSegment];
    const totalDuration = existingDuration + durationMs;

    const primaryAssets = allSegments[0].assets;
    const primaryPreviewAsset = primaryAssets.screen ?? primaryAssets.webcam ?? null;

    return {
      assets: primaryAssets,
      events: toGlobalEvents(allSegments),
      duration: totalDuration,
      fileName: existingProject.fileName || `recording.${fileExtension}`,
      previewPath: primaryPreviewAsset?.filePath,
      segments: allSegments,
      projectId: existingProject.id,
      reviewState: existingProject.reviewState,
    };
  }

  const segment: RecordingSegment = {
    id: crypto.randomUUID(),
    assets,
    events: inputEvents,
    startOffset: 0,
    duration: durationMs,
    trimStart: 0,
    trimEnd: 0,
  };

  const previewAsset = assets.screen ?? assets.webcam ?? null;

  return {
    assets,
    events: toGlobalEvents([segment]),
    duration: durationMs,
    fileName: `recording.${fileExtension}`,
    previewPath: previewAsset?.filePath,
    segments: [segment],
  };
};

export const finalizeRecordingAssets = async (deps: {
  durationMs: number;
  recorders: AssetRecorderState[];
  fileExtension: string;
  patchBlob: (blob: Blob, durationMs: number) => Promise<Blob>;
  backendAPI: RecordingBackend;
  previousRecording: LastRecording;
  inputEvents: InputEventRecord[];
  nativeRecordingFilePath: string | null;
  onNativeRecordingConsumed: () => void;
  setLastRecording: (value: LastRecording) => void;
  setAppView: (view: "recorder" | "review") => void;
  existingProject?: RecordingProject | null;
  clearCurrentProject?: () => void;
}): Promise<void> => {
  const {
    durationMs,
    recorders,
    fileExtension,
    patchBlob,
    backendAPI,
    previousRecording,
    inputEvents,
    nativeRecordingFilePath,
    onNativeRecordingConsumed,
    setLastRecording,
    setAppView,
    existingProject,
    clearCurrentProject,
  } = deps;

  const assets: RecordingAssets = {};

  try {
    if (recorders.length) {
      const assetChunks = await Promise.all(recorders.map(({ promise }) => promise));
      for (const chunk of assetChunks) {
        const patchedBlob = await patchBlob(chunk.blob, durationMs);
        const filePath = await saveAssetToStorage(backendAPI, patchedBlob, chunk.fileName);
        const fallbackMime =
          chunk.type === "audio" ? "audio/webm;codecs=opus" : "video/mp4";
        assets[chunk.type] = {
          type: chunk.type,
          fileName: chunk.fileName,
          filePath,
          mimeType: patchedBlob.type || chunk.blob.type || fallbackMime,
        };
      }
    }

    if (nativeRecordingFilePath) {
      assets.screen = {
        type: "screen",
        fileName: "screen.mp4",
        filePath: nativeRecordingFilePath,
        mimeType: "video/mp4",
      };
      onNativeRecordingConsumed();
    }

    await revokeRecordingAssets(backendAPI, previousRecording);

    setLastRecording(
      buildRecordingResult({
        assets,
        inputEvents,
        durationMs,
        fileExtension,
        existingProject,
      })
    );

    if (existingProject && existingProject.segments.length > 0) {
      clearCurrentProject?.();
    }

    setAppView("review");
  } catch (error) {
    console.error("Failed to finalize recording", error);
  } finally {
    recorders.forEach(({ stream }) =>
      stream.getTracks().forEach((track) => track.stop())
    );
  }
};
