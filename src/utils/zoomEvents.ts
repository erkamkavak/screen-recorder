import type { TimelineZoomEvent } from "../stores/timeline";

export const ZOOM_MATCH_THRESHOLD_SECONDS = 0.05;

export const findZoomEventForTime = (
  events: TimelineZoomEvent[],
  seconds: number
): TimelineZoomEvent | undefined =>
  events.find(
    (event) =>
      Math.abs(seconds - (event.startTime + event.duration / 2)) <
      ZOOM_MATCH_THRESHOLD_SECONDS
  );

export const hasZoomEventForTime = (
  events: TimelineZoomEvent[],
  seconds: number
): boolean => Boolean(findZoomEventForTime(events, seconds));
