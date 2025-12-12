import type { WebcamState, RecordingAssetType } from "../stores";
import type { MicState, AssetChunk, AssetRecorderState } from "./recordingController.types";

export const canUseMediaRecorder = typeof MediaRecorder !== "undefined";

export const cloneStream = (stream: MediaStream) => {
  const cloned = new MediaStream();
  stream.getTracks().forEach((track) => {
    cloned.addTrack(track.clone());
  });
  return cloned;
};

export const createAssetRecorder = (
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

export const collectMediaRecorders = (params: {
  videoMime: { mimeType: string; ext: string };
  webcam: WebcamState;
  mic: MicState;
}): AssetRecorderState[] => {
  const { videoMime, webcam, mic } = params;

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
