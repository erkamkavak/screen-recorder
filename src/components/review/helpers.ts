import type { InputEventRecord, PointerEventRecord } from "../../stores";

const pointerBufferMs = 250;

export const humanDuration = (secondsTotal: number) => {
  if (!isFinite(secondsTotal) || secondsTotal <= 0) return "0s";
  const secs = Math.floor(secondsTotal);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m || h) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
};

export const formatTimestamp = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

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
) => {
  if (!events.length) {
    return { x: 0.5, y: 0.5, visible: false };
  }

  const targetTime = Math.max(0, time) * 1000;
  let best: PointerEventRecord | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const event of events) {
    if (typeof event.x !== "number" || typeof event.y !== "number") continue;
    const delta = Math.abs(event.t - targetTime);
    if (delta < bestDelta) {
      best = event;
      bestDelta = delta;
    }
  }

  if (!best || bestDelta > bufferMs) {
    return { x: 0.5, y: 0.5, visible: false };
  }

  return {
    x: Math.min(Math.max(best.x ?? 0.5, 0), 1),
    y: Math.min(Math.max(best.y ?? 0.5, 0), 1),
    visible: true,
  };
};
