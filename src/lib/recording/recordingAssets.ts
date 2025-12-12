import type { InputEventRecord, LastRecording, RecordingAssets } from "../stores";
import type { AssetRecorderState, RecordingBackend } from "./recordingController.types";

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

    const previewAsset = assets.screen ?? assets.webcam ?? null;
    setLastRecording({
      assets,
      events: inputEvents,
      duration: durationMs,
      fileName: `recording.${fileExtension}`,
      previewPath: previewAsset?.filePath,
    });

    setAppView("review");
  } catch (error) {
    console.error("Failed to finalize recording", error);
  } finally {
    recorders.forEach(({ stream }) =>
      stream.getTracks().forEach((track) => track.stop())
    );
  }
};
