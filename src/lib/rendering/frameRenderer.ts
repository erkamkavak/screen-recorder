/**
 * Frame rendering utilities
 * Handles canvas compositing of screen, webcam, cursor, and effects
 */

import type { CanvasSize, PointerEventRecord, Share, DrawArgs } from "../stores";
import type { GeneralLayoutState, ScreenState, WebcamLayoutState, Theme } from "../stores";
import type { TimelineZoomEvent } from "../stores/timeline";
import type { Background } from "./types";
import { calculateScreenPlacement, drawScreenShare, drawWebcam } from "../canvas/layoutDrawers";
import { computeZoomState } from "../timeline/timelinePlayback";
import { computePointerState } from "../pointer/pointerState";

/**
 * Configuration for frame rendering
 */
export interface FrameRenderConfig {
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    canvasSize: CanvasSize;
    theme: Theme;
    background: Background;
    generalLayoutState: GeneralLayoutState;
    screenLayoutState: ScreenState;
    webcamLayoutState: WebcamLayoutState;
    screenShare: Share;
    webcamVideo: HTMLVideoElement | null;
    pointerRecords: PointerEventRecord[];
    clickRecords: PointerEventRecord[];
    pointerIconImage: HTMLImageElement | null;
    pointerPressedIconImage: HTMLImageElement | null;
    pointerSize: number;
    zoomEvents: TimelineZoomEvent[];
    toggles: {
        showScreen: boolean;
        showWebcam: boolean;
        showMouse: boolean;
        showClicks: boolean;
    };
}

/**
 * Create draw arguments for layout drawer functions
 */
export const createDrawArgs = (config: FrameRenderConfig): DrawArgs => {
    return {
        ctx: config.ctx,
        theme: config.theme,
        canvasSize: config.canvasSize,
        activeShare: config.screenShare,
        webcamState: {
            stream: null,
            preview: config.webcamVideo,
            width: config.webcamVideo?.videoWidth ?? 0,
            height: config.webcamVideo?.videoHeight ?? 0,
        },
        micAnalyzer: null,
        generalLayoutState: config.generalLayoutState,
        webcamLayoutState: config.webcamLayoutState,
        screenLayoutState: config.screenLayoutState,
    };
};

/**
 * Render a single frame at the given time
 */
export const renderFrameContent = (
    config: FrameRenderConfig,
    currentTime: number
): void => {
    const { ctx, canvas, toggles, pointerRecords, clickRecords, background } = config;
    const drawArgs = createDrawArgs(config);

    // Calculate screen placement for pointer positioning
    const placement = calculateScreenPlacement(
        config.canvasSize,
        drawArgs.activeShare,
        config.screenLayoutState,
        config.generalLayoutState
    );

    // Get pointer state at current time
    const pointerState = computePointerState(currentTime, pointerRecords);
    const pointerHasActivity = placement && pointerState.visible;
    const pointerPivotX = pointerHasActivity
        ? placement.x + pointerState.x * placement.width
        : null;
    const pointerPivotY = pointerHasActivity
        ? placement.y + pointerState.y * placement.height
        : null;

    // Calculate zoom state from timeline events
    const { scale, focusX, focusY } = computeZoomState(config.zoomEvents, currentTime);

    const drawClickRipples = (timeSec: number) => {
        if (!toggles.showClicks || !placement || clickRecords.length === 0) return;

        const timeMs = timeSec * 1000;
        const rippleDurationMs = 200;

        const baseHeight = 1080;
        const resolutionScale = config.canvasSize.height / baseHeight;
        const POINTER_RENDER_SCALE = 2.5;
        const pointerRenderSize = config.pointerSize * POINTER_RENDER_SCALE * resolutionScale;

        // Find clicks within the ripple window, starting from latest.
        for (let i = clickRecords.length - 1; i >= 0; i--) {
            const click = clickRecords[i];
            if (typeof click.x !== "number" || typeof click.y !== "number") continue;

            const ageMs = timeMs - click.t;
            if (ageMs < 0) continue;
            if (ageMs > rippleDurationMs) break;

            const progress = ageMs / rippleDurationMs;
            const alpha = Math.max(0, 1 - progress);

            const cx = placement.x + click.x * placement.width;
            const cy = placement.y + click.y * placement.height;

            const radius = pointerRenderSize * (0.2 + progress * 0.3);
            const lineWidth = Math.max(1, 2 * resolutionScale);

            ctx.save();
            ctx.globalCompositeOperation = "source-over";

            // Draw Ring (Salmon)
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = `rgba(250, 128, 114, ${alpha})`; // Salmon
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();

            // Draw Dot (Teal)
            ctx.fillStyle = `rgba(13, 148, 136, ${alpha})`; // Teal
            ctx.beginPath();
            ctx.arc(cx, cy, pointerRenderSize * 0.08, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    };

    // Clear and prepare canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "medium";
    ctx.globalCompositeOperation = "source-over";

    // Draw background
    background.draw(drawArgs);

    // Apply zoom transform
    ctx.save();
    const pivotXNormalized =
        pointerPivotX !== null && canvas.width > 0
            ? Math.min(Math.max(pointerPivotX / canvas.width, 0), 1)
            : focusX;
    const pivotYNormalized =
        pointerPivotY !== null && canvas.height > 0
            ? Math.min(Math.max(pointerPivotY / canvas.height, 0), 1)
            : focusY;
    const pivotX = pivotXNormalized * canvas.width;
    const pivotY = pivotYNormalized * canvas.height;
    ctx.translate(pivotX, pivotY);
    ctx.scale(scale, scale);
    ctx.translate(-pivotX, -pivotY);

    // Draw screen share
    if (toggles.showScreen) {
        drawScreenShare(drawArgs);
    }

    // Draw click ripples (under cursor)
    if (toggles.showScreen) {
        drawClickRipples(currentTime);
    }

    // Draw pointer/cursor
    if (toggles.showMouse && pointerRecords.length && placement && pointerState.visible) {
        const cursorShape = pointerState.cursorShape || "default";
        const usePointerIcon = cursorShape === "pointer" || pointerState.isPressed;
        const icon = usePointerIcon
            ? config.pointerPressedIconImage ?? config.pointerIconImage
            : config.pointerIconImage;

        // Scale pointer based on canvas resolution
        // Base scale is for 1080p (1920x1080), scale up for higher resolutions
        const baseHeight = 1080;
        const resolutionScale = config.canvasSize.height / baseHeight;
        const POINTER_RENDER_SCALE = 2.5;
        const size = config.pointerSize * POINTER_RENDER_SCALE * resolutionScale;
        const pointerLeft = placement.x + pointerState.x * placement.width;
        const pointerTop = placement.y + pointerState.y * placement.height;

        if (icon) {
            // Align cursor image hotspot with recorded x/y so it matches click position.
            // These are tuned for the default cursor pack.
            const hotspot = usePointerIcon
                ? { x: 0.5, y: 0.12 }
                : { x: 0.18, y: 0.2 };
            const drawX = pointerLeft - size * hotspot.x;
            const drawY = pointerTop - size * hotspot.y;
            ctx.drawImage(
                icon,
                drawX,
                drawY,
                size,
                size
            );
        }
    }

    ctx.restore();

    // Draw webcam (on top of everything)
    if (toggles.showWebcam && config.webcamVideo) {
        drawWebcam(drawArgs);
    }
};

/**
 * Load a pointer icon image
 */
export const loadPointerImage = async (
    src?: string | null
): Promise<HTMLImageElement | null> => {
    if (!src) return null;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
};
