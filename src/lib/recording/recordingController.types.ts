import type { Readable, Writable } from "svelte/store";
import type {
  InputEventRecord,
  LastRecording,
  PointerEventRecord,
  RecordingAssetType,
  RecordingAssets,
  RecordingProject,
  Share,
  WebcamState,
} from "../stores";
import type { NativeMouseEvent } from "../backend/backendAPI";

export type MicState = {
  stream?: MediaStream | null;
  deviceId?: string | null;
};

export type AssetChunk = {
  type: RecordingAssetType;
  blob: Blob;
  fileName: string;
};

export type AssetRecorderState = {
  type: RecordingAssetType;
  recorder: MediaRecorder;
  stream: MediaStream;
  promise: Promise<AssetChunk>;
};

export type RecordingStores = {
  appView: Writable<"recorder" | "review">;
  inputEvents: Writable<InputEventRecord[]>;
  lastRecording: Writable<LastRecording>;
  currentProject: Writable<RecordingProject | null>;
  recordingFPS: Readable<number>;
  recordingStartTime: Writable<number | null>;
  displayStream: Readable<MediaStream | null>;
  webcamState: Readable<WebcamState>;
  micState: Readable<MicState>;
  activeShare: Readable<Share | null | undefined>;
};

export type RecordingBackend = {
  saveRecordingAsset: (fileName: string, buffer: ArrayBuffer) => Promise<string>;
  readRecordingAsset: (filePath: string) => Promise<ArrayBuffer>;
  cleanupRecordingAssets: (paths: string[]) => Promise<unknown>;
  startNativeRecording: (options: {
    targetId: string;
    captureType: string;
    includeCursor: boolean;
    frameRate: number;
    fileName?: string;
  }) => Promise<string>;
  stopNativeRecording: () => Promise<string>;
  getRecordingMouseEvents: () => Promise<NativeMouseEvent[]>;
  clearRecordingMouseEvents: () => Promise<void>;
};

export type CreateRecordingControllerDeps = {
  stores: RecordingStores;
  backendAPI: RecordingBackend;
  patchBlob: (blob: Blob, durationMs: number) => Promise<Blob>;
  getPreferredMimeType: () => { mimeType: string; ext: string };
  now?: () => number;
};

export type RecordingController = {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
};

export type NativeMouseMapper = (nativeMouseEvents: NativeMouseEvent[]) => PointerEventRecord[];
