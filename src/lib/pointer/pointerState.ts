import type { InputEventRecord, PointerEventRecord } from "../stores";

const pointerBufferMs = 250;

export type ComputedPointerState = {
  x: number;
  y: number;
  visible: boolean;
  kind: PointerEventRecord["kind"] | null;
  isPressed: boolean;
  cursorShape: string;
};

export const getPointerRecords = (events: InputEventRecord[] | null | undefined): PointerEventRecord[] =>
  (events ?? [])
    .filter((event): event is PointerEventRecord =>
      event.kind === "pointermove" ||
      event.kind === "click" ||
      event.kind === "pointerdown" ||
      event.kind === "pointerup"
    )
    .sort((a, b) => a.t - b.t);

export const computePointerState = (
  time: number,
  events: PointerEventRecord[],
  bufferMs = pointerBufferMs
): ComputedPointerState => {
  if (!events.length) {
    return { x: 0.5, y: 0.5, visible: false, kind: null, isPressed: false, cursorShape: "default" };
  }

  const targetTime = Math.max(0, time) * 1000;
  let lastEvent: PointerEventRecord | null = null;
  let nextEvent: PointerEventRecord | null = null;
  let lastDown: PointerEventRecord | null = null;
  let lastUp: PointerEventRecord | null = null;

  // Find the last event at or before targetTime, and the first event after
  for (const event of events) {
    if (event.t <= targetTime) {
      if (typeof event.x === "number" && typeof event.y === "number") {
        lastEvent = event;
      }
      if (event.kind === "pointerdown") {
        lastDown = event;
      } else if (event.kind === "pointerup") {
        lastUp = event;
      }
    } else if (!nextEvent && typeof event.x === "number" && typeof event.y === "number") {
      nextEvent = event;
    }
  }

  const isPressed = Boolean(lastDown && (!lastUp || lastDown.t > lastUp.t));

  // If no event before current time, use the first event if it's close enough
  if (!lastEvent) {
    if (nextEvent && nextEvent.t - targetTime <= bufferMs) {
      return {
        x: Math.min(Math.max(nextEvent.x ?? 0.5, 0), 1),
        y: Math.min(Math.max(nextEvent.y ?? 0.5, 0), 1),
        visible: true,
        kind: nextEvent.kind,
        isPressed,
        cursorShape: nextEvent.cursorShape || "default",
      };
    }
    return { x: 0.5, y: 0.5, visible: false, kind: null, isPressed, cursorShape: "default" };
  }

  // Interpolate between lastEvent and nextEvent for smoother movement
  let x = lastEvent.x ?? 0.5;
  let y = lastEvent.y ?? 0.5;
  
  if (nextEvent && nextEvent.t > lastEvent.t) {
    const totalDelta = nextEvent.t - lastEvent.t;
    const progress = (targetTime - lastEvent.t) / totalDelta;
    // Clamp progress to [0, 1] to avoid extrapolation
    const t = Math.max(0, Math.min(1, progress));
    x = (lastEvent.x ?? 0.5) + t * ((nextEvent.x ?? 0.5) - (lastEvent.x ?? 0.5));
    y = (lastEvent.y ?? 0.5) + t * ((nextEvent.y ?? 0.5) - (lastEvent.y ?? 0.5));
  }

  const normalizedX = Math.min(Math.max(x, 0), 1);
  const normalizedY = Math.min(Math.max(y, 0), 1);
  
  // Check if we're within buffer of the last known position
  const timeSinceLastEvent = targetTime - lastEvent.t;
  const isVisible = timeSinceLastEvent <= bufferMs || (nextEvent && nextEvent.t - targetTime <= bufferMs);

  return {
    x: normalizedX,
    y: normalizedY,
    visible: isVisible,
    kind: lastEvent.kind,
    isPressed,
    cursorShape: lastEvent.cursorShape || "default",
  };
};
