/**
 * Zoom Camera Follow State Management
 * 
 * Provides smooth camera follow behavior for zoom effects,
 * with proper edge clamping to ensure the focused content is always visible.
 */

export interface ZoomFollowConfig {
  /** Current zoom scale (1 = no zoom, 2 = 2x zoom, etc.) */
  scale: number;
  /** Base focus point X (0-1, normalized) from the zoom event */
  baseFocusX: number;
  /** Base focus point Y (0-1, normalized) from the zoom event */
  baseFocusY: number;
  /** Current cursor X position (0-1, normalized), null if not available */
  cursorX: number | null;
  /** Current cursor Y position (0-1, normalized), null if not available */
  cursorY: number | null;
  /** Whether to follow the cursor dynamically */
  followCursor: boolean;
  /** Canvas width in pixels */
  canvasWidth: number;
  /** Canvas height in pixels */
  canvasHeight: number;
}

export interface ZoomFollowResult {
  /** Final X focus point (0-1, normalized) after all adjustments */
  focusX: number;
  /** Final Y focus point (0-1, normalized) after all adjustments */
  focusY: number;
  /** The scale to apply */
  scale: number;
}

export interface ScreenPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculates the canvas-normalized cursor position from screen-normalized coordinates
 */
export const getCanvasNormalizedCursor = (
  cursorState: { x: number; y: number; visible: boolean } | null,
  placement: ScreenPlacement | null,
  canvasSize: { width: number; height: number }
): { x: number; y: number } | null => {
  if (!cursorState || !cursorState.visible || !placement || canvasSize.width === 0 || canvasSize.height === 0) {
    return null;
  }
  return {
    x: (placement.x + cursorState.x * placement.width) / canvasSize.width,
    y: (placement.y + cursorState.y * placement.height) / canvasSize.height
  };
};

/** 
 * Smooth lerp state to persist between frames for smooth camera movement
 */
export interface ZoomFollowLerpState {
  currentX: number;
  currentY: number;
  velocityX: number;
  velocityY: number;
  lastUpdateTime: number;
}

export const createInitialLerpState = (): ZoomFollowLerpState => ({
  currentX: 0.5,
  currentY: 0.5,
  velocityX: 0,
  velocityY: 0,
  lastUpdateTime: 0,
});

/**
 * Simple linear interpolation
 */
const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};

/**
 * Smooth damp function (similar to Unity's SmoothDamp)
 * Provides smooth, natural-looking camera movement with velocity tracking
 */
const smoothDamp = (
  current: number,
  target: number,
  velocity: { value: number },
  smoothTime: number,
  deltaTime: number,
  maxSpeed: number = Infinity
): number => {
  // Based on Game Programming Gems 4 Chapter 1.10
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  
  let change = current - target;
  const originalTo = target;
  
  // Clamp maximum speed
  const maxChange = maxSpeed * smoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  target = current - change;
  
  const temp = (velocity.value + omega * change) * deltaTime;
  velocity.value = (velocity.value - omega * temp) * exp;
  
  let output = target + (change + temp) * exp;
  
  // Prevent overshooting
  if (originalTo - current > 0 === output > originalTo) {
    output = originalTo;
    velocity.value = (output - originalTo) / deltaTime;
  }
  
  return output;
};

/**
 * Calculate the safe bounds for the focus point given a zoom scale.
 * This ensures the zoomed view doesn't extend beyond the canvas edges.
 * 
 * The key insight: at 2x zoom, you can only see 50% of the content,
 * so the focus point can only be in the center 50% of the canvas.
 */
const calculateSafeBounds = (
  scale: number
): { minX: number; maxX: number; minY: number; maxY: number } => {
  if (scale <= 1) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  
  // The visible window is 1/scale of the total size
  // The focus point needs to be at least halfWindow from edges
  const halfWindowX = 0.5 / scale;
  const halfWindowY = 0.5 / scale;
  
  return {
    minX: halfWindowX,
    maxX: 1 - halfWindowX,
    minY: halfWindowY,
    maxY: 1 - halfWindowY,
  };
};

/**
 * Clamp a value between min and max with optional padding
 */
const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Calculate improved focus point that keeps content visible.
 * Uses a "dead zone" approach where the camera only moves when
 * the cursor approaches the edges of the visible area.
 */
const calculateFocusWithDeadZone = (
  cursorPos: number,
  currentFocus: number,
  scale: number,
  deadZoneRatio: number = 0.3
): number => {
  if (scale <= 1) return 0.5;
  
  // Calculate the visible window size
  const windowSize = 1 / scale;
  
  // Calculate dead zone size (portion of visible area where no movement occurs)
  const deadZoneSize = windowSize * deadZoneRatio;
  const halfDeadZone = deadZoneSize / 2;
  
  // Calculate dead zone bounds
  const deadZoneMin = currentFocus - halfDeadZone;
  const deadZoneMax = currentFocus + halfDeadZone;
  
  // If cursor is within dead zone, don't move
  if (cursorPos >= deadZoneMin && cursorPos <= deadZoneMax) {
    return currentFocus;
  }
  
  // Calculate how much to shift the focus
  let targetFocus = currentFocus;
  
  if (cursorPos < deadZoneMin) {
    // Cursor is above/left of dead zone, shift focus to bring cursor into dead zone
    targetFocus = cursorPos + halfDeadZone;
  } else if (cursorPos > deadZoneMax) {
    // Cursor is below/right of dead zone, shift focus to bring cursor into dead zone
    targetFocus = cursorPos - halfDeadZone;
  }
  
  // Clamp to safe bounds
  const bounds = calculateSafeBounds(scale);
  return clamp(targetFocus, bounds.minX, bounds.maxX);
};

/**
 * Main function to compute the zoom camera follow state
 */
export const computeZoomFollowState = (
  config: ZoomFollowConfig,
  lerpState: ZoomFollowLerpState | null,
  currentTime: number,
  smoothTime: number = 0.15 // How quickly to follow (lower = faster)
): { result: ZoomFollowResult; lerpState: ZoomFollowLerpState } => {
  const { scale, baseFocusX, baseFocusY, cursorX, cursorY, followCursor } = config;
  
  // Initialize or get lerp state
  const state = lerpState ?? createInitialLerpState();
  
  // Calculate delta time
  const deltaTime = state.lastUpdateTime > 0 
    ? Math.min(currentTime - state.lastUpdateTime, 0.1) // Cap at 100ms to prevent huge jumps
    : 0.016; // Default to ~60fps
  
  let targetX: number;
  let targetY: number;
  
  if (followCursor && cursorX !== null && cursorY !== null && scale > 1) {
    // Use dead zone calculation for smooth following
    targetX = calculateFocusWithDeadZone(cursorX, state.currentX, scale);
    targetY = calculateFocusWithDeadZone(cursorY, state.currentY, scale);
  } else {
    // Use the base focus point from the zoom event
    targetX = baseFocusX;
    targetY = baseFocusY;
  }
  
  // Apply safe bounds clamping
  const bounds = calculateSafeBounds(scale);
  targetX = clamp(targetX, bounds.minX, bounds.maxX);
  targetY = clamp(targetY, bounds.minY, bounds.maxY);
  
  // Smooth damp to target position
  const velX = { value: state.velocityX };
  const velY = { value: state.velocityY };
  
  const newX = deltaTime > 0
    ? smoothDamp(state.currentX, targetX, velX, smoothTime, deltaTime)
    : targetX;
  const newY = deltaTime > 0
    ? smoothDamp(state.currentY, targetY, velY, smoothTime, deltaTime)
    : targetY;
  
  // Final clamping after smoothing
  const finalX = clamp(newX, bounds.minX, bounds.maxX);
  const finalY = clamp(newY, bounds.minY, bounds.maxY);
  
  return {
    result: {
      focusX: finalX,
      focusY: finalY,
      scale,
    },
    lerpState: {
      currentX: finalX,
      currentY: finalY,
      velocityX: velX.value,
      velocityY: velY.value,
      lastUpdateTime: currentTime,
    },
  };
};

/**
 * Simple version without lerp state tracking - useful for single frame rendering.
 * This is the shared source of truth for both preview and final render.
 */
export const computeZoomFocusSimple = (
  scale: number,
  baseFocusX: number,
  baseFocusY: number,
  cursorX: number | null,
  cursorY: number | null,
  followCursor: boolean
): ZoomFollowResult => {
  let focusX = baseFocusX;
  let focusY = baseFocusY;
  
  if (scale > 1 && cursorX !== null && cursorY !== null) {
      if (followCursor) {
          // Smooth blend between base focus and cursor position
          // Higher weight = follows cursor more closely
          const cursorWeight = 0.75;
          focusX = baseFocusX * (1 - cursorWeight) + cursorX * cursorWeight;
          focusY = baseFocusY * (1 - cursorWeight) + cursorY * cursorWeight;
      } else {
          // Legacy behavior: follow cursor directly
          focusX = cursorX;
          focusY = cursorY;
      }
  }
  
  // Apply robust edge clamping
  // At scale S, the visible window is 1/S. 
  // To stay within [0,1], the center point must be within [0.5/S, 1 - 0.5/S]
  if (scale > 1) {
      const halfWindow = 0.5 / scale;
      focusX = Math.max(halfWindow, Math.min(1 - halfWindow, focusX));
      focusY = Math.max(halfWindow, Math.min(1 - halfWindow, focusY));
  } else {
      focusX = 0.5;
      focusY = 0.5;
  }
  
  return { focusX, focusY, scale };
};

/**
 * Calculate the optimal focus point for a click-to-zoom action.
 * This ensures the clicked location is visible and well-centered.
 */
export const calculateOptimalZoomFocus = (
  clickX: number,
  clickY: number,
  targetScale: number,
  screenPlacement?: { x: number; y: number; width: number; height: number }
): { focusX: number; focusY: number } => {
  // Normalize click position if screen placement is provided
  let normalizedX = clickX;
  let normalizedY = clickY;
  
  if (screenPlacement && screenPlacement.width > 0 && screenPlacement.height > 0) {
    normalizedX = (clickX - screenPlacement.x) / screenPlacement.width;
    normalizedY = (clickY - screenPlacement.y) / screenPlacement.height;
  }
  
  // Clamp to valid range
  normalizedX = clamp(normalizedX, 0, 1);
  normalizedY = clamp(normalizedY, 0, 1);
  
  // Apply safe bounds for the target scale
  const bounds = calculateSafeBounds(targetScale);
  
  return {
    focusX: clamp(normalizedX, bounds.minX, bounds.maxX),
    focusY: clamp(normalizedY, bounds.minY, bounds.maxY),
  };
};
