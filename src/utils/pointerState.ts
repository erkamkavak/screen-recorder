import type { InputEventRecord, PointerEventRecord } from "../stores";

const pointerBufferMs = 250;

export type ComputedPointerState = {
  x: number;
  y: number;
  visible: boolean;
  kind: PointerEventRecord["kind"] | null;
  isPressed: boolean;
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
    return { x: 0.5, y: 0.5, visible: false, kind: null, isPressed: false };
  }

  const targetTime = Math.max(0, time) * 1000;
  let best: PointerEventRecord | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  let lastDown: PointerEventRecord | null = null;
  let lastUp: PointerEventRecord | null = null;

  for (const event of events) {
    if (typeof event.x !== "number" || typeof event.y !== "number") continue;
    const delta = Math.abs(event.t - targetTime);
    if (delta < bestDelta) {
      best = event;
      bestDelta = delta;
    }
  }

  for (const event of events) {
    if (event.t > targetTime) break;
    if (event.kind === "pointerdown") {
      lastDown = event;
    } else if (event.kind === "pointerup") {
      lastUp = event;
    }
  }

  const isPressed = Boolean(lastDown && (!lastUp || lastDown.t > lastUp.t));

  if (!best) {
    return { x: 0.5, y: 0.5, visible: false, kind: null, isPressed };
  }

  const normalizedX = Math.min(Math.max(best.x ?? 0.5, 0), 1);
  const normalizedY = Math.min(Math.max(best.y ?? 0.5, 0), 1);
  const isVisible = bestDelta <= bufferMs;

  return {
    x: normalizedX,
    y: normalizedY,
    visible: isVisible,
    kind: best.kind,
    isPressed,
  };
};
