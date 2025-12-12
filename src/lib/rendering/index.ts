/**
 * Rendering module
 * 
 * High-quality video rendering using WebCodecs API
 */

// Main render function
export { render, isWebCodecsAvailable } from "./render";

// Types
export type {
    RenderOptions,
    RenderResult,
    RenderToggleConfig,
    RenderTimingStats,
    EncoderConfig,
} from "./types";

// Re-export commonly needed store types
export type {
    RecordingAssets,
    TimelineSnapshot,
} from "./types";
