import type { TimelineZoomEvent } from "../stores/timeline";

const MIN_DURATION = 0.0001;

export const findActiveZoom = (
  events: TimelineZoomEvent[],
  currentTime: number
): TimelineZoomEvent | null => {
  if (!events?.length) return null;
  return (
    events.find((event) => {
      const duration = Math.max(event.duration, 0);
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
  const eased = Math.sin(progress * Math.PI);
  return 1 + eased * Math.max(0, event.zoom - 1);
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
  const zoom = events?.length ? findActiveZoom(events, currentTime) : null;
  if (!zoom) {
    return { zoom: null, scale: 1, focusX: 0.5, focusY: 0.5 };
  }

  const scale = computeZoomScale(zoom, currentTime);
  const focusX = typeof zoom.focusX === "number" ? zoom.focusX : 0.5;
  const focusY = typeof zoom.focusY === "number" ? zoom.focusY : 0.5;

  return { zoom, scale, focusX, focusY };
};
