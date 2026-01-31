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
import { computeZoomState, computeZoomScale } from "../timeline/timelinePlayback";
import { computeZoomFocusSimple, getCanvasNormalizedCursor, calculateFocusWithDeadZone } from "../zoom/zoomFollowState";
import { computePointerState } from "../pointer/pointerState";

import type { CinematicEffectsConfig, CinematicState } from "./cinematicEffects";
import { ANIMATION_STYLES, getAdaptiveSmoothTime, smoothDamp, applyCursorMotionBlur } from "./cinematicEffects";

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
    cinematicEffects?: CinematicEffectsConfig;
    cinematicState?: CinematicState;
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

    // Get pointer state
    const pointerState = computePointerState(currentTime, pointerRecords);
    
    // Apply cinematic effects if state is provided
    let cursorX = pointerState.x;
    let cursorY = pointerState.y;
    let cursorVisible = pointerState.visible;

    if (config.cinematicState && config.cinematicEffects) {
        const { cinematicState, cinematicEffects } = config;
        const deltaTime = config.cinematicState.lastUpdateSec > 0 
            ? Math.min(currentTime - cinematicState.lastUpdateSec, 0.1) 
            : 1/30;

        const style = ANIMATION_STYLES[cinematicEffects.animationStyle];
        
        // Glide Effect (SmoothDamp)
        if (cinematicEffects.glideEnabled) {
            const smoothTime = getAdaptiveSmoothTime(cinematicState.cursorVelocity, style);
            
            cursorX = smoothDamp(cinematicState.cursorPos.x, pointerState.x, cinematicState.cursorVelocity.x, smoothTime, deltaTime);
            cursorY = smoothDamp(cinematicState.cursorPos.y, pointerState.y, cinematicState.cursorVelocity.y, smoothTime, deltaTime);
            
            cinematicState.cursorPos = { x: cursorX, y: cursorY };
        } else {
            cinematicState.cursorPos = { x: pointerState.x, y: pointerState.y };
            cinematicState.cursorVelocity.x.value = 0;
            cinematicState.cursorVelocity.y.value = 0;
            cursorX = pointerState.x;
            cursorY = pointerState.y;
        }

        // Static Cursor Hiding
        const moveDistSq = (pointerState.x - cinematicState.cursorPos.x) ** 2 + (pointerState.y - cinematicState.cursorPos.y) ** 2;
        if (moveDistSq > 0.00001) {
            cinematicState.lastMovementTime = currentTime;
        }

        if (cinematicEffects.hideWhenStatic && cursorVisible) {
            const timeSinceLastMovement = currentTime - cinematicState.lastMovementTime;
            if (timeSinceLastMovement > 1.0) { // 1 second threshold
                cursorVisible = false;
            }
        }

        cinematicState.lastUpdateSec = currentTime;
    }

    // Now convert the (smoothed) screen cursor to canvas-normalized for zoom logic
    const canvasCursor = getCanvasNormalizedCursor({ x: cursorX, y: cursorY, visible: cursorVisible }, placement, canvas);

    // Calculate zoom state from timeline events
    const zoomState = computeZoomState(config.zoomEvents, currentTime);

    // Reactive zoom scale override: ensure global "Zoom Level" affects existing zooms
    if (zoomState.zoom && config.cinematicEffects?.zoomScale) {
        const originalZoom = zoomState.zoom.zoom;
        zoomState.zoom.zoom = config.cinematicEffects.zoomScale;
        zoomState.scale = computeZoomScale(zoomState.zoom, currentTime);
        zoomState.zoom.zoom = originalZoom;
    }
    
    // Determine the effective focus point for zoom using shared logic
    let targetFocusX = zoomState.focusX;
    let targetFocusY = zoomState.focusY;

    if (zoomState.scale > 1 && zoomState.followCursor && canvasCursor) {
        const deadZone = config.cinematicEffects?.deadZone ?? 0.1;
        targetFocusX = calculateFocusWithDeadZone(canvasCursor.x, config.cinematicState?.zoomFocus.x ?? zoomState.focusX, zoomState.scale, deadZone);
        targetFocusY = calculateFocusWithDeadZone(canvasCursor.y, config.cinematicState?.zoomFocus.y ?? zoomState.focusY, zoomState.scale, deadZone);
    }

    let { focusX: zoomFocusX, focusY: zoomFocusY, scale } = { focusX: targetFocusX, focusY: targetFocusY, scale: zoomState.scale };

    // Smooth Zoom Transition
    if (config.cinematicState && config.cinematicEffects?.smoothZoomEnabled) {
        const { cinematicState, cinematicEffects } = config;
        const deltaTime = 1/30; // Use constant or derived delta
        const style = ANIMATION_STYLES[cinematicEffects.animationStyle];

        zoomFocusX = smoothDamp(cinematicState.zoomFocus.x, zoomFocusX, cinematicState.zoomVelocity.x, style.smoothTime * 0.8, deltaTime);
        zoomFocusY = smoothDamp(cinematicState.zoomFocus.y, zoomFocusY, cinematicState.zoomVelocity.y, style.smoothTime * 0.8, deltaTime);

        cinematicState.zoomFocus = { x: zoomFocusX, y: zoomFocusY };
    }

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
    if (toggles.showScreen && cursorVisible) {
        if (toggles.showMouse && pointerRecords.length && placement) {
            ctx.save();
            // Apply motion blur if enabled
            if (config.cinematicEffects?.motionBlurStrength && config.cinematicState) {
                applyCursorMotionBlur(
                    ctx, 
                    config.cinematicState.cursorVelocity, 
                    config.cinematicEffects.motionBlurStrength
                );
            }

            drawPointerCursorOverlay({
                ctx,
                placement,
                canvasSize: config.canvasSize,
                pointerSize: config.pointerSize,
                pointerState: { ...pointerState, x: cursorX, y: cursorY },
                iconDefault: config.pointerIconImage,
                iconPressed: config.pointerPressedIconImage,
            });
            ctx.restore();
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
