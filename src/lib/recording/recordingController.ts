import { get } from "svelte/store";
import { collectMediaRecorders } from "./mediaRecorders";
import { startNativeScreenRecording, mapNativeMouseEventsToPointerRecords } from "./nativeScreenRecording";
import { finalizeRecordingAssets } from "./recordingAssets";
import type {
  AssetRecorderState,
  CreateRecordingControllerDeps,
  RecordingController,
} from "./recordingController.types";

export type { RecordingController };

export const createRecordingController = (
  deps: CreateRecordingControllerDeps
): RecordingController => {
  const {
    stores: {
      appView,
      inputEvents,
      lastRecording,
      currentProject,
      recordingFPS,
      recordingStartTime,
      displayStream,
      webcamState,
      micState,
      activeShare,
    },
    backendAPI,
    patchBlob,
    getPreferredMimeType,
  } = deps;

  const now = deps.now ?? (() => performance.now());

  let currentAssetRecorders: AssetRecorderState[] = [];
  let recordingFileExtension = "webm";
  let nativeRecordingFilePath: string | null = null;
  const beginRecordingSession = (recorders: AssetRecorderState[]) => {
  if (!nativeRecordingFilePath && !recorders.length) {
    recorders.forEach(({ stream }) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    return;
  }

  currentAssetRecorders = recorders;
  recordingStartTime.set(now());
  inputEvents.set([]);
  appView.set("recorder");
  };

  const startRecording = async () => {
    const videoMime = getPreferredMimeType();
    recordingFileExtension = videoMime.ext;
    const $displayStream = get(displayStream);
    const $recordingFPS = get(recordingFPS);

    if ($displayStream?.getTracks().length) {
      try {
        const share = get(activeShare);
        nativeRecordingFilePath = await startNativeScreenRecording(
          backendAPI,
          share,
          $recordingFPS
        );
      } catch {
        return;
      }
    }

    const recorders = collectMediaRecorders({
      videoMime,
      webcam: get(webcamState),
      mic: get(micState),
    });
    beginRecordingSession(recorders);
  };

  const stopRecording = async () => {
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

    const startTime = get(recordingStartTime) ?? now();
    const durationMs = now() - startTime;
    recordingStartTime.set(null);

    const recordersToFinalize = currentAssetRecorders.slice();
    currentAssetRecorders = [];

    recordersToFinalize.forEach(({ recorder }) => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    });

    const $currentProject = get(currentProject);
    const isContinuation = $currentProject !== null && $currentProject.segments.length > 0;

    void finalizeRecordingAssets({
      durationMs,
      recorders: recordersToFinalize,
      fileExtension: recordingFileExtension,
      patchBlob,
      backendAPI,
      previousRecording: isContinuation ? null : get(lastRecording),
      inputEvents: get(inputEvents),
      nativeRecordingFilePath,
      onNativeRecordingConsumed: () => {
        nativeRecordingFilePath = null;
      },
      setLastRecording: (value) => lastRecording.set(value),
      setAppView: (view) => appView.set(view),
      existingProject: $currentProject,
      clearCurrentProject: () => currentProject.set(null),
    });
  };

  return { startRecording, stopRecording };
};