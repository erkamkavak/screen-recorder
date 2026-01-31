/**
 * Cinematic effects for rendering
 * Includes:
 * - Glide effect (critically damped spring physics)
 * - Directional motion blur
 * - Animation style presets
 * - Static cursor hiding
 */

export interface CinematicEffectsConfig {
    /** Whether to enable glide effect (critically damped spring) */
    glideEnabled: boolean;
    /** Animation style for smoothing */
    animationStyle: "slow" | "mellow" | "quick" | "rapid";
    /** Motion blur strength (0-1) for cursor and zoom */
    motionBlurStrength: number;
    /** Whether to hide cursor when static */
    hideWhenStatic: boolean;
    /** Whether to use smooth zoom transitions */
    smoothZoomEnabled: boolean;
    /** Dead zone ratio (0-1) for zoom following */
    deadZone: number;
    /** Default zoom scale (1.5-3.0) */
    zoomScale: number;
    /** Easing function for transitions */
    easing: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export type EasingType = "linear" | "easeIn" | "easeOut" | "easeInOut";

export interface SpringConfig {
    stiffness: number;
    damping: number;
    mass: number;
}

export const SPRING_PRESETS = {
    gentle: { stiffness: 120, damping: 20, mass: 1 },
    smooth: { stiffness: 180, damping: 24, mass: 1 },
    snappy: { stiffness: 300, damping: 30, mass: 1 },
    cinematic: { stiffness: 80, damping: 18, mass: 1.5 },
    screenStudio: { stiffness: 150, damping: 22, mass: 1.2 },
} as const;

export type AnimationStyleName = 'slow' | 'mellow' | 'quick' | 'rapid';

export const ANIMATION_STYLES: Record<AnimationStyleName, { smoothTime: number; minSmoothTime: number }> = {
    slow: {
        smoothTime: 0.45,
        minSmoothTime: 0.15,
    },
    mellow: {
        smoothTime: 0.25,
        minSmoothTime: 0.08,
    },
    quick: {
        smoothTime: 0.12,
        minSmoothTime: 0.04,
    },
    rapid: {
        smoothTime: 0.06,
        minSmoothTime: 0.02,
    },
};

export interface CinematicState {
    // Cursor physics
    cursorPos: { x: number; y: number };
    cursorVelocity: { x: { value: number }; y: { value: number } };
    lastMovementTime: number;
    
    // Zoom physics
    zoomFocus: { x: number; y: number };
    zoomVelocity: { x: { value: number }; y: { value: number } };
    
    lastUpdateSec: number;
}

export const createInitialCinematicState = (initialX = 0.5, initialY = 0.5): CinematicState => ({
    cursorPos: { x: initialX, y: initialY },
    cursorVelocity: { x: { value: 0 }, y: { value: 0 } },
    lastMovementTime: 0,
    zoomFocus: { x: 0.5, y: 0.5 },
    zoomVelocity: { x: { value: 0 }, y: { value: 0 } },
    lastUpdateSec: 0,
});

/**
 * Smooth damp function
 */
export const smoothDamp = (
    current: number,
    target: number,
    velocity: { value: number },
    smoothTime: number,
    deltaTime: number,
    maxSpeed: number = Infinity
): number => {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / smoothTime;
    
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    
    let change = current - target;
    const originalTo = target;
    
    const maxChange = maxSpeed * smoothTime;
    change = Math.max(-maxChange, Math.min(maxChange, change));
    target = current - change;
    
    const temp = (velocity.value + omega * change) * deltaTime;
    velocity.value = (velocity.value - omega * temp) * exp;
    
    let output = target + (change + temp) * exp;
    
    if (originalTo - current > 0 === output > originalTo) {
        output = originalTo;
        velocity.value = (output - originalTo) / deltaTime;
    }
    
    return output;
};

/**
 * Apply directional motion blur kernel shadow to a canvas element
 */
export const applyCursorMotionBlur = (
    ctx: CanvasRenderingContext2D,
    cursorVelocity: { x: { value: number }; y: { value: number } },
    strength: number = 0.5
) => {
    if (strength <= 0) return;
    
    const velocityX = cursorVelocity.x.value;
    const velocityY = cursorVelocity.y.value;
    
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
    if (speed < 0.001) return;
    
    // Motion blur length is proportional to speed
    const blurLength = speed * 0.05 * strength;
    if (blurLength < 0.5) return;
    
    // Directional blur using shadows
    ctx.shadowBlur = blurLength;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowOffsetX = -velocityX * 0.01 * strength;
    ctx.shadowOffsetY = -velocityY * 0.01 * strength;
};

/**
 * Adaptive smoothing time based on velocity
 */
export const getAdaptiveSmoothTime = (
    cursorVelocity: { x: { value: number }; y: { value: number } },
    style: { smoothTime: number; minSmoothTime: number },
    velocityThreshold: number = 0.5
): number => {
    const speed = Math.sqrt(cursorVelocity.x.value ** 2 + cursorVelocity.y.value ** 2);
    const speedFactor = Math.min(1, speed / velocityThreshold);
    return style.smoothTime - (style.smoothTime - style.minSmoothTime) * speedFactor;
};
