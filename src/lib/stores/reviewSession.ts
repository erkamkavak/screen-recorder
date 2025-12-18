import { writable, derived, get } from "svelte/store";
import type { ResolutionPresetId, FrameRatePresetId } from "../rendering/renderPresets";
import { lastRecording, type PointerEventRecord } from "../stores";
import { getPointerRecords } from "../pointer/pointerState";

export type RenderFormat = "mp4" | "webm";

export interface ReviewSessionState {
    includePointerTrack: boolean;
    includeWebcamTrack: boolean;
    includeAudioTrack: boolean;
    includeClickTrack: boolean;
    pointerIndicatorSize: number;
    pointerIconSelection: string;
    renderFormat: RenderFormat;
    selectedResolutionPreset: ResolutionPresetId;
    selectedFrameRatePreset: FrameRatePresetId;
    showCaptions: boolean;
}

const DEFAULT_STATE: ReviewSessionState = {
    includePointerTrack: true,
    includeWebcamTrack: true,
    includeAudioTrack: true,
    includeClickTrack: true,
    pointerIndicatorSize: 18,
    pointerIconSelection: "cutecore-pink",
    renderFormat: "mp4",
    selectedResolutionPreset: "scale-100",
    selectedFrameRatePreset: "fps-original",
    showCaptions: true,
};

function createReviewSessionStore() {
    const { subscribe, set, update } = writable<ReviewSessionState>(DEFAULT_STATE);

    return {
        subscribe,
        set,
        update,
        reset: () => set(DEFAULT_STATE),
        setIncludePointerTrack: (v: boolean) => update(s => ({ ...s, includePointerTrack: v })),
        setIncludeWebcamTrack: (v: boolean) => update(s => ({ ...s, includeWebcamTrack: v })),
        setIncludeAudioTrack: (v: boolean) => update(s => ({ ...s, includeAudioTrack: v })),
        setIncludeClickTrack: (v: boolean) => update(s => ({ ...s, includeClickTrack: v })),
        setPointerIndicatorSize: (v: number) => update(s => ({ ...s, pointerIndicatorSize: v })),
        setPointerIconSelection: (v: string) => update(s => ({ ...s, pointerIconSelection: v })),
        setRenderFormat: (v: RenderFormat) => update(s => ({ ...s, renderFormat: v })),
        setSelectedResolutionPreset: (v: ResolutionPresetId) => update(s => ({ ...s, selectedResolutionPreset: v })),
        setSelectedFrameRatePreset: (v: FrameRatePresetId) => update(s => ({ ...s, selectedFrameRatePreset: v })),
        setShowCaptions: (v: boolean) => update(s => ({ ...s, showCaptions: v })),
    };
}

export const reviewSessionStore = createReviewSessionStore();

export const pointerRecords = derived(lastRecording, ($recording) => {
    return getPointerRecords($recording?.events);
});

export const sortedClickEventsStore = derived(pointerRecords, ($records) => {
    return $records.filter(r => r.kind === "click").sort((a, b) => a.t - b.t);
});
