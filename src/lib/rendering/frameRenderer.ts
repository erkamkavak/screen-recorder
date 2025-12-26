/**
 * Frame rendering utilities
 * Handles canvas compositing of screen, webcam, cursor, and effects
 */

import type { CanvasSize, PointerEventRecord, Share, DrawArgs } from "../stores";
import type { GeneralLayoutState, ScreenState, WebcamLayoutState, Theme } from "../stores";
import type { TimelineZoomEvent } from "../stores/timeline";
import type { Background } from "./types";
import type { CaptionSegment } from "./types";
import { calculateScreenPlacement, drawScreenShare, drawWebcam } from "../canvas/layoutDrawers";
import { drawCaptionsOverlay } from "../canvas/captions";
import { drawClickRipplesOverlay, drawPointerCursorOverlay } from "../canvas/pointerOverlays";
import { computeZoomState } from "../timeline/timelinePlayback";
import { computeZoomFocusSimple, getCanvasNormalizedCursor } from "../zoom/zoomFollowState";
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
    captions?: CaptionSegment[];
    toggles: {
        showScreen: boolean;
        showWebcam: boolean;
        showMouse: boolean;
        showClicks: boolean;
        showCaptions: boolean;
        captionFontSize: number;
        captionColor: string;
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
        screenFrame: (config as any).screenFrame,
        webcamFrame: (config as any).webcamFrame,
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

    // Get pointer state and normalize it to the canvas
    const pointerState = computePointerState(currentTime, pointerRecords);
    const canvasCursor = getCanvasNormalizedCursor(pointerState, placement, canvas);
    
    // Calculate zoom state from timeline events
    const zoomState = computeZoomState(config.zoomEvents, currentTime);
    
    // Determine the effective focus point for zoom using shared logic
    const { focusX: zoomFocusX, focusY: zoomFocusY, scale } = computeZoomFocusSimple(
        zoomState.scale,
        zoomState.focusX,
        zoomState.focusY,
        canvasCursor?.x ?? null,
        canvasCursor?.y ?? null,
        zoomState.followCursor ?? false
    );

    // Clear and draw background first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    background.draw(drawArgs);
    ctx.globalCompositeOperation = "source-over";

    // Apply the zoom transform
    ctx.save();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-zoomFocusX * canvas.width, -zoomFocusY * canvas.height);

    // Draw screen share
    if (toggles.showScreen) {
        drawScreenShare(drawArgs);
    }

    // Draw click ripples (under cursor)
    if (toggles.showScreen) {
        if (toggles.showClicks && placement && clickRecords.length) {
            drawClickRipplesOverlay({
                ctx,
                placement,
                clickRecords,
                timeSec: currentTime,
                canvasSize: config.canvasSize,
                pointerSize: config.pointerSize,
            });
        }
    }

    // Draw pointer/cursor
    if (toggles.showScreen) {
        if (toggles.showMouse && pointerRecords.length && placement) {
            drawPointerCursorOverlay({
                ctx,
                placement,
                canvasSize: config.canvasSize,
                pointerSize: config.pointerSize,
                pointerState,
                iconDefault: config.pointerIconImage,
                iconPressed: config.pointerPressedIconImage,
            });
        }
    }

    ctx.restore();

    // Draw webcam (on top of everything)
    if (toggles.showWebcam && config.webcamVideo) {
        drawWebcam(drawArgs);
    }

    // Draw captions (not affected by zoom)
    if (toggles.showScreen) {
        if (toggles.showCaptions && config.captions?.length) {
            drawCaptionsOverlay({
                ctx,
                canvas,
                canvasSize: config.canvasSize,
                timeSec: currentTime,
                segments: config.captions,
                fontSize: toggles.captionFontSize,
                color: toggles.captionColor,
            });
        }
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
