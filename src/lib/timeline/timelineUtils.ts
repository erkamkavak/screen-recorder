
import type { PointerEventRecord, RecordingSegment } from "../stores";

export const clampTime = (time: number, duration: number) => Math.max(0, Math.min(duration, time));

export const getPositionPercent = (seconds: number, duration: number) => {
    if (duration <= 0) return 0;
    return (seconds / duration) * 100;
};

export const formatTime = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export interface SegmentBoundary {
    id: string;
    originalStartSec: number;
    originalEndSec: number;
    effectiveStartSec: number;
    effectiveEndSec: number;
    effectiveDurationSec: number;
    originalDurationSec: number;
    trimStartSec: number;
    trimEndSec: number;
    index: number;
}

export const calculateSegmentBoundaries = (segments: RecordingSegment[]): SegmentBoundary[] => {
    if (!segments || segments.length === 0) return [];
    const boundaries: SegmentBoundary[] = [];
    let accumulatedOriginal = 0;
    let accumulatedEffective = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const originalDurationSec = seg.duration / 1000;
        const trimStartSec = seg.trimStart / 1000;
        const trimEndSec = seg.trimEnd / 1000;
        const effectiveDurationSec = Math.max(0, originalDurationSec - trimStartSec - trimEndSec);
        boundaries.push({
            id: seg.id,
            originalStartSec: accumulatedOriginal,
            originalEndSec: accumulatedOriginal + originalDurationSec,
            effectiveStartSec: accumulatedEffective,
            effectiveEndSec: accumulatedEffective + effectiveDurationSec,
            effectiveDurationSec,
            originalDurationSec,
            trimStartSec,
            trimEndSec,
            index: i,
        });
        accumulatedOriginal += originalDurationSec;
        accumulatedEffective += effectiveDurationSec;
    }
    return boundaries;
};

export const effectiveToDisplayTime = (effectiveSeconds: number, duration: number, segmentBoundaries: SegmentBoundary[]) => {
    const t = clampTime(effectiveSeconds, duration);
    if (!segmentBoundaries.length) return t;
    for (const b of segmentBoundaries) {
        if (t >= b.effectiveStartSec && t <= b.effectiveEndSec) {
            const delta = t - b.effectiveStartSec;
            return clampTime(b.originalStartSec + b.trimStartSec + delta, duration);
        }
    }
    const last = segmentBoundaries[segmentBoundaries.length - 1];
    return clampTime(last.originalEndSec - last.trimEndSec, duration);
};

export const focusForTime = (seconds: number, duration: number, clickEvents: PointerEventRecord[]) => {
    const target = clampTime(seconds, duration);
    if (!clickEvents.length) return { x: 0.5, y: 0.5 };

    let closest = clickEvents[0];
    let minDelta = Math.abs(closest.t / 1000 - target);

    for (const event of clickEvents) {
        const delta = Math.abs(event.t / 1000 - target);
        if (delta < minDelta) {
            minDelta = delta;
            closest = event;
        }
    }

    return {
        x: typeof closest.x === "number" ? closest.x : 0.5,
        y: typeof closest.y === "number" ? closest.y : 0.5,
    };
};
