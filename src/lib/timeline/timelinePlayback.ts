import type { TimelineZoomEvent } from "../stores/timeline";

const MIN_DURATION = 0.0001;

const safeDuration = (duration: number) => Math.max(duration, MIN_DURATION);

export const mergeZoomEvents = (events: TimelineZoomEvent[]): TimelineZoomEvent[] => {
  if (!events?.length) return [];
  const sorted = [...events].sort((a, b) => a.startTime - b.startTime);
  const merged: TimelineZoomEvent[] = [];
  let current: TimelineZoomEvent = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    const currentEnd = current.startTime + safeDuration(current.duration);
    const nextEnd = next.startTime + safeDuration(next.duration);

    if (next.startTime <= currentEnd) {
      const mergedEnd = Math.max(currentEnd, nextEnd);
      current = {
        ...current,
        duration: Math.max(mergedEnd - current.startTime, MIN_DURATION),
        zoom: Math.max(current.zoom, next.zoom),
        focusX: typeof next.focusX === "number" ? next.focusX : current.focusX,
        focusY: typeof next.focusY === "number" ? next.focusY : current.focusY,
        easing: next.easing ?? current.easing,
        label: next.label ?? current.label,
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
};

export const findActiveZoom = (
  events: TimelineZoomEvent[],
  currentTime: number
): TimelineZoomEvent | null => {
  if (!events?.length) return null;
  return (
    events.find((event) => {
      const duration = safeDuration(event.duration);
      const start = event.startTime;
      const end = start + duration;
      return currentTime >= start && currentTime <= end;
    }) ?? null
  );
};

export const computeZoomScale = (event: TimelineZoomEvent, currentTime: number): number => {
  if (!event) return 1;
  const duration = Math.max(event.duration, MIN_DURATION);
  const progress = (currentTime - event.startTime) / duration;
  if (progress <= 0 || progress >= 1) return 1;

  const zoomDelta = event.zoom - 1;
  if (zoomDelta <= 0) return 1;

  const RAMP_FRACTION = 0.25;
  const easeInOutSine = (t: number) => 0.5 * (1 - Math.cos(Math.PI * t));

  const rampStart = RAMP_FRACTION;
  const rampEnd = 1 - RAMP_FRACTION;

  if (progress <= rampStart) {
    const rampProgress = progress / RAMP_FRACTION;
    const eased = easeInOutSine(Math.min(Math.max(rampProgress, 0), 1));
    return 1 + eased * zoomDelta;
  }

  if (progress < rampEnd) {
    return 1 + zoomDelta;
  }

  const rampProgress = (progress - rampEnd) / RAMP_FRACTION;
  const eased = easeInOutSine(Math.min(Math.max(rampProgress, 0), 1));
  return 1 + (1 - eased) * zoomDelta;
};

export interface ZoomState {
  zoom: TimelineZoomEvent | null;
  scale: number;
  focusX: number;
  focusY: number;
}

export const computeZoomState = (
  events: TimelineZoomEvent[] | undefined,
  currentTime: number
): ZoomState => {
  const mergedEvents = mergeZoomEvents(events ?? []);
  const zoom = mergedEvents.length ? findActiveZoom(mergedEvents, currentTime) : null;
  if (!zoom) {
    return { zoom: null, scale: 1, focusX: 0.5, focusY: 0.5 };
  }

  const scale = computeZoomScale(zoom, currentTime);
  const focusX = typeof zoom.focusX === "number" ? zoom.focusX : 0.5;
  const focusY = typeof zoom.focusY === "number" ? zoom.focusY : 0.5;

  return { zoom, scale, focusX, focusY };
};
