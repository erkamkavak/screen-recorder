
import type { CanvasSize } from "../stores";

export type ResolutionPresetId = "scale-100" | "scale-75" | "scale-50";
export type ResolutionPreset = { id: ResolutionPresetId; label: string; scale: number };

export const baseResolutionPresets: Omit<ResolutionPreset, "label">[] = [
    { id: "scale-100", scale: 1 },
    { id: "scale-75", scale: 0.75 },
    { id: "scale-50", scale: 0.5 },
];

export const getResolutionPresets = (canvasDimensions: CanvasSize): ResolutionPreset[] => {
    return baseResolutionPresets.map((preset) => {
        const scaledWidth = Math.max(2, Math.round(canvasDimensions.width * preset.scale));
        const scaledHeight = Math.max(2, Math.round(canvasDimensions.height * preset.scale));
        const suffix = preset.scale === 1 ? "(100%)" : preset.scale === 0.75 ? "(75%)" : "(50%)";
        return {
            id: preset.id as ResolutionPresetId,
            scale: preset.scale,
            label: `${scaledWidth} × ${scaledHeight} ${suffix}`,
        };
    });
};

export type FrameRatePresetId = "fps-original" | "fps-60" | "fps-30";
export type FrameRatePreset = { id: FrameRatePresetId; label: string; fps: number | "original" };

export const frameRatePresets: FrameRatePreset[] = [
    { id: "fps-original", label: "Original", fps: "original" },
    { id: "fps-60", label: "60 fps", fps: 60 },
    { id: "fps-30", label: "30 fps", fps: 30 },
];
