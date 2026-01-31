import { writable, derived, get } from "svelte/store";
import type { ResolutionPresetId, FrameRatePresetId } from "../rendering/renderPresets";
import { lastRecording, type PointerEventRecord } from "../stores";
import { getPointerRecords } from "../pointer/pointerState";
import type { TranscriptionVersion } from "./transcription";
import type { TranscriptionJobSnapshot } from "../backend/backendAPI";

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
    captionFontSize: number;
    captionColor: string;
    transcriptionVersions: TranscriptionVersion[];
    activeTranscriptionId: string | null;
    transcriptionJob: {
        jobId: string | null;
        status: TranscriptionJobSnapshot | null;
        running: boolean;
        error: string | null;
    };
    cinematicEffects: import("../rendering/cinematicEffects").CinematicEffectsConfig;
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
    captionFontSize: 46,
    captionColor: "#ffffff",
    transcriptionVersions: [],
    activeTranscriptionId: null,
    transcriptionJob: { jobId: null, status: null, running: false, error: null },
    cinematicEffects: {
        glideEnabled: true,
        animationStyle: "mellow",
        motionBlurStrength: 0.5,
        hideWhenStatic: false,
        smoothZoomEnabled: true,
        deadZone: 0.1,
        zoomScale: 2.0,
        easing: "easeInOut",
    },
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
        setCaptionFontSize: (v: number) => update(s => ({ ...s, captionFontSize: v })),
        setCaptionColor: (v: string) => update(s => ({ ...s, captionColor: v })),
        setTranscriptionVersions: (v: TranscriptionVersion[]) => update(s => ({ ...s, transcriptionVersions: v })),
        setActiveTranscriptionId: (v: string | null) => update(s => ({ ...s, activeTranscriptionId: v })),
        setTranscriptionJob: (v: Partial<ReviewSessionState["transcriptionJob"]>) => update(s => ({ 
            ...s, 
            transcriptionJob: { ...s.transcriptionJob, ...v } 
        })),
        setCinematicEffects: (v: Partial<ReviewSessionState["cinematicEffects"]>) => update(s => ({
            ...s,
            cinematicEffects: { ...s.cinematicEffects, ...v }
        })),
    };
}

export const reviewSessionStore = createReviewSessionStore();

export const pointerRecords = derived(lastRecording, ($recording) => {
    return getPointerRecords($recording?.events);
});

export const sortedClickEventsStore = derived(pointerRecords, ($records) => {
    return $records.filter(r => r.kind === "click").sort((a, b) => a.t - b.t);
});

export const transcriptionResult = derived(
    reviewSessionStore,
    ($session) => {
        const { transcriptionVersions, activeTranscriptionId } = $session;
        if (transcriptionVersions.length === 0) return null;
        if (!activeTranscriptionId) return transcriptionVersions[transcriptionVersions.length - 1];
        return transcriptionVersions.find(v => v.id === activeTranscriptionId) ?? transcriptionVersions[transcriptionVersions.length - 1];
    }
);
