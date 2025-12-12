import type { RecordingBackend } from "./recordingController.types";
import type { Share, PointerEventRecord } from "../stores";
import type { NativeMouseEvent } from "../backend/backendAPI";

export const startNativeScreenRecording = async (
  backendAPI: RecordingBackend,
  activeShare: Share | null | undefined,
  fps: number | null
): Promise<string> => {
  const targetId = activeShare?.id || "monitor:0";
  const captureType = targetId.startsWith("window:") ? "window" : "monitor";

  return await backendAPI.startNativeRecording({
    targetId,
    captureType,
    includeCursor: false,
    frameRate: fps || 30,
    fileName: "screen.mp4",
  });
};

export const mapNativeMouseEventsToPointerRecords = (
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
      cursorShape: e.cursorShape || "default",
    };
  });

  pointerRecords.sort((a, b) => a.t - b.t);

  const enrichedRecords: PointerEventRecord[] = [...pointerRecords];
  for (const event of pointerRecords) {
    if (event.kind === "pointerdown") {
      enrichedRecords.push({
        kind: "click",
        t: event.t,
        x: event.x,
        y: event.y,
        button: event.button,
        cursorShape: event.cursorShape,
      });
    }
  }

  enrichedRecords.sort((a, b) => a.t - b.t);
  return enrichedRecords;
};
