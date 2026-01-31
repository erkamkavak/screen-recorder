/**
 * Rendering type definitions
 */

import type { CanvasSize, DrawFn, Background } from "../stores";
import type { GeneralLayoutState, ScreenState, WebcamLayoutState, Theme, Share } from "../stores";
import type { PointerEventRecord, RecordingAsset, RecordingAssets, RecordingSegment } from "../stores";
import type { TimelineSnapshot, TimelineZoomEvent } from "../stores/timeline";
import type { CinematicEffectsConfig } from "./cinematicEffects";

/**
 * Toggle configuration for what elements to include in the render
 */
export interface RenderToggleConfig {
    showScreen: boolean;
    showWebcam: boolean;
    showMouse: boolean;
    showClicks: boolean;
    showCaptions: boolean;
    captionFontSize: number;
    captionColor: string;
    includeAudio: boolean;
}

export interface CaptionSegment {
    startMs: number;
    endMs: number;
    text: string;
    speaker?: string | null;
}

/**
 * Options for the render function
 */
export interface RenderOptions {
    /** Target frame rate (default: 30) */
    frameRate?: number;
    /** Progress callback */
    onProgress?: (current: number, total: number) => void;
    /** Output canvas dimensions */
    canvasSize: CanvasSize;
    /** General layout settings */
    generalLayoutState: GeneralLayoutState;
    /** Screen layout settings */
    screenLayoutState: ScreenState;
    /** Webcam layout settings */
    webcamLayoutState: WebcamLayoutState;
    /** Visual theme */
    theme: Theme;
    /** Background drawer */
    background: Background;
    /** What to include in render */
    toggles: RenderToggleConfig;
    /** Pointer/mouse event records for cursor overlay */
    pointerRecords?: PointerEventRecord[];
    /** Custom pointer icon URL */
    pointerIconUrl?: string | null;
    /** Custom pointer pressed icon URL */
    pointerIconPressedUrl?: string | null;
    /** Pointer size in pixels */
    pointerSize?: number;
    /** Token for cancellation */
    cancelToken?: { cancelled: boolean };

    /** Captions to render on top of the canvas (not affected by zoom) */
    captions?: CaptionSegment[];

    /** Cinematic effects configuration */
    cinematicEffects?: CinematicEffectsConfig;

    /** Original source audio path that the captions belong to */
    sourceAudioPath?: string;
}

/**
 * Result of a successful render
 */
export type RenderResult =
    | {
        type: "blob";
        blob: Blob;
        mimeType: string;
        ext: string;
    }
    | {
        type: "file";
        filePath: string;
        mimeType: string;
        ext: string;
    };

/**
 * Internal state for tracking render timing
 */
export interface RenderTimingStats {
    totalWaitMs: number;
    totalRenderMs: number;
    totalEncodeQueueMs: number;
    startTime: number;
}

/**
 * Encoder configuration derived from resolution
 */
export interface EncoderConfig {
    codec: string;
    width: number;
    height: number;
    bitrate: number;
    bitrateMode: "variable" | "constant";
    latencyMode: "quality" | "realtime";
    framerate: number;
}

/**
 * Re-export types that consumers might need
 */
export type {
    CanvasSize,
    GeneralLayoutState,
    ScreenState,
    WebcamLayoutState,
    Theme,
    PointerEventRecord,
    RecordingAsset,
    RecordingAssets,
    RecordingSegment,
    Share,
    Background,
    TimelineSnapshot,
    TimelineZoomEvent,
};
