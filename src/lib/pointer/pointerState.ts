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

/**
 * Deduplicates pointer events to ensure clean visuals while maintaining visibility.
 * - Always keeps 'pointerdown', 'pointerup', and 'pointermove' so the cursor remains visible
 *   and its position/pressed state stays accurate.
 * - Filters 'click' events so only one ripple occurs per logical press (the first 'down' event).
 */
export const deduplicatePointerEvents = (records: PointerEventRecord[]): PointerEventRecord[] => {
  const result: PointerEventRecord[] = [];
  const pressedButtons = new Set<number>();

  // Track the timestamp of the first 'pointerdown' in the current press sequence
  const pressStartTimes = new Map<number, number>();

  for (const record of records) {
    const button = record.button ?? 0;

    if (record.kind === "pointerdown") {
      // Always keep for position and visibility tracking
      result.push(record);

      if (!pressedButtons.has(button)) {
        pressedButtons.add(button);
        pressStartTimes.set(button, record.t);
      }
    } else if (record.kind === "pointerup") {
      result.push(record);
      pressedButtons.delete(button);
      pressStartTimes.delete(button);
    } else if (record.kind === "click") {
      // Only allow the click event that corresponds to the start of the press
      if (pressStartTimes.has(button) && pressStartTimes.get(button) === record.t) {
        result.push(record);
        // Clear it so even if multiple click events exist at this timestamp, only one is kept
        pressStartTimes.set(button, -1);
      }
    } else {
      // Always keep pointermove events
      result.push(record);
    }
  }

  return result;
};

export const getPointerRecords = (events: InputEventRecord[] | null | undefined): PointerEventRecord[] => {
  const filtered = (events ?? [])
    .filter((event): event is PointerEventRecord =>
      event.kind === "pointermove" ||
      event.kind === "click" ||
      event.kind === "pointerdown" ||
      event.kind === "pointerup"
    )
    .sort((a, b) => a.t - b.t);

  return deduplicatePointerEvents(filtered);
};

export const computePointerState = (
  time: number,
  events: PointerEventRecord[],
  bufferMs = pointerBufferMs
): ComputedPointerState => {
  if (!events.length) {
    return { x: 0.5, y: 0.5, visible: false, kind: null, isPressed: false, cursorShape: "default" };
  }

  const targetTime = Math.max(0, time) * 1000;
  // For position, ignore "click" events so cursor position doesn't jump/interpolate based on clicks.
  // Click visuals should be rendered from click events directly.
  let lastPosEvent: PointerEventRecord | null = null;
  let nextPosEvent: PointerEventRecord | null = null;
  let lastDown: PointerEventRecord | null = null;
  let lastUp: PointerEventRecord | null = null;

  // Find the last positional event at or before targetTime, and the first positional event after.
  // Track down/up separately for pressed state.
  for (const event of events) {
    if (event.t <= targetTime) {
      if (
        event.kind !== "click" &&
        typeof event.x === "number" &&
        typeof event.y === "number"
      ) {
        lastPosEvent = event;
      }
      if (event.kind === "pointerdown") {
        lastDown = event;
      } else if (event.kind === "pointerup") {
        lastUp = event;
      }
    } else if (
      !nextPosEvent &&
      event.kind !== "click" &&
      typeof event.x === "number" &&
      typeof event.y === "number"
    ) {
      nextPosEvent = event;
    }
  }

  const isPressed = Boolean(lastDown && (!lastUp || lastDown.t > lastUp.t));

  // If no positional event before current time, use the first positional event if it's close enough
  if (!lastPosEvent) {
    if (nextPosEvent && nextPosEvent.t - targetTime <= bufferMs) {
      return {
        x: Math.min(Math.max(nextPosEvent.x ?? 0.5, 0), 1),
        y: Math.min(Math.max(nextPosEvent.y ?? 0.5, 0), 1),
        visible: true,
        kind: nextPosEvent.kind,
        isPressed,
        cursorShape: nextPosEvent.cursorShape || "default",
      };
    }
    return { x: 0.5, y: 0.5, visible: false, kind: null, isPressed, cursorShape: "default" };
  }

  // Interpolate between lastEvent and nextEvent for smoother movement
  let x = lastPosEvent.x ?? 0.5;
  let y = lastPosEvent.y ?? 0.5;

  if (nextPosEvent && nextPosEvent.t > lastPosEvent.t) {
    const totalDelta = nextPosEvent.t - lastPosEvent.t;
    const progress = (targetTime - lastPosEvent.t) / totalDelta;
    // Clamp progress to [0, 1] to avoid extrapolation
    const t = Math.max(0, Math.min(1, progress));
    x = (lastPosEvent.x ?? 0.5) + t * ((nextPosEvent.x ?? 0.5) - (lastPosEvent.x ?? 0.5));
    y = (lastPosEvent.y ?? 0.5) + t * ((nextPosEvent.y ?? 0.5) - (lastPosEvent.y ?? 0.5));
  }

  const normalizedX = Math.min(Math.max(x, 0), 1);
  const normalizedY = Math.min(Math.max(y, 0), 1);

  // Check if we're within buffer of the last known position
  const timeSinceLastEvent = targetTime - lastPosEvent.t;
  const isVisible =
    timeSinceLastEvent <= bufferMs ||
    (nextPosEvent && nextPosEvent.t - targetTime <= bufferMs);

  return {
    x: normalizedX,
    y: normalizedY,
    visible: isVisible,
    kind: lastPosEvent.kind,
    isPressed,
    cursorShape: lastPosEvent.cursorShape || "default",
  };
};
