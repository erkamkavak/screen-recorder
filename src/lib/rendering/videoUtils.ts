/**
 * Video utility functions for media handling
 */

/**
 * Wait for a media element to load its metadata
 */
export const waitForMetadata = (media: HTMLMediaElement): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (media.readyState >= 1) {
            resolve();
            return;
        }

        const onLoaded = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(new Error("Failed to load media metadata"));
        };

        const cleanup = () => {
            media.removeEventListener("loadedmetadata", onLoaded);
            media.removeEventListener("error", onError);
        };

        media.addEventListener("loadedmetadata", onLoaded);
        media.addEventListener("error", onError);
        media.load();
    });
};

/**
 * Seek a media element to a specific time
 */
export const seekMedia = (media: HTMLMediaElement, time: number): Promise<void> => {
    const targetTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    const currentTime = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    const epsilon = 0.001;
    if (Math.abs(currentTime - targetTime) <= epsilon) {
        return Promise.resolve();
    }

    const boundedTargetTime =
        Number.isFinite(media.duration) && media.duration > 0
            ? Math.min(targetTime, Math.max(0, media.duration - epsilon))
            : targetTime;

    return new Promise((resolve, reject) => {
        const timeoutMs = 5000;
        let timeoutId: number | undefined;

        const cleanup = () => {
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
                timeoutId = undefined;
            }
        };

        const onSeeked = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(new Error("Seek failed"));
        };

        media.addEventListener("seeked", onSeeked, { once: true });
        media.addEventListener("error", onError, { once: true });

        timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error("Seek timeout"));
        }, timeoutMs);

        try {
            const anyMedia = media as any;
            if (typeof anyMedia.fastSeek === "function") {
                anyMedia.fastSeek(boundedTargetTime);
            } else {
                media.currentTime = boundedTargetTime;
            }
        } catch (e) {
            cleanup();
            reject(e instanceof Error ? e : new Error("Seek failed"));
        }
    });
};

/**
 * Interface for browsers that support requestVideoFrameCallback
 */
interface RequestVideoFrameCallback {
    requestVideoFrameCallback(callback: VideoFrameRequestCallback): number;
}

/**
 * Wait for the next video frame to be available
 */
export const waitForNextVideoFrame = (video: HTMLVideoElement): Promise<void> => {
    return new Promise((resolve) => {
        if ("requestVideoFrameCallback" in video) {
            (video as unknown as RequestVideoFrameCallback).requestVideoFrameCallback(() => resolve());
        } else {
            // Fallback for browsers without requestVideoFrameCallback
            requestAnimationFrame(() => resolve());
        }
    });
};

/**
 * Capture a frame at a specific time by seeking
 */
export const captureFrameAt = async (video: HTMLVideoElement, time: number): Promise<void> => {
    await seekMedia(video, time);
    await waitForNextVideoFrame(video);
};

/**
 * Wait for a video frame at or after the target time
 * Uses requestVideoFrameCallback for precise frame timing
 */
export const waitForFrameAtOrAfter = (
    video: HTMLVideoElement,
    targetTime: number
): Promise<void> => {
    return new Promise((resolve) => {
        // If video is already past target time, resolve immediately
        if (video.currentTime >= targetTime - 0.001) {
            resolve();
            return;
        }

        // Check if requestVideoFrameCallback is available
        const hasRVFC = typeof (video as any).requestVideoFrameCallback === "function";

        if (!hasRVFC) {
            // Fallback for browsers without requestVideoFrameCallback
            const checkTime = () => {
                if (video.currentTime >= targetTime - 0.001) {
                    resolve();
                } else {
                    requestAnimationFrame(checkTime);
                }
            };
            requestAnimationFrame(checkTime);
            return;
        }

        // Use requestVideoFrameCallback for precise frame timing
        const videoWithCallback = video as unknown as RequestVideoFrameCallback;

        const frameCallback = (
            _now: DOMHighResTimeStamp,
            metadata: VideoFrameCallbackMetadata
        ) => {
            if (metadata.mediaTime >= targetTime - 0.001) {
                resolve();
            } else {
                videoWithCallback.requestVideoFrameCallback(frameCallback);
            }
        };

        videoWithCallback.requestVideoFrameCallback(frameCallback);
    });
};

/**
 * Create a video element from an asset URL
 */
export const createVideoElement = (assetUrl: string): HTMLVideoElement => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = assetUrl;
    return video;
};

/**
 * Wait for a frame with timeout to prevent infinite hangs at end of video
 */
export const waitForFrameWithTimeout = async (
    video: HTMLVideoElement,
    time: number,
    timeoutMs: number = 2000
): Promise<void> => {
    // If video has ended or time is past duration, just use current frame
    if (video.ended || (video.duration && time >= video.duration - 0.1)) {
        return;
    }

    const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Frame wait timeout")), timeoutMs)
    );

    try {
        await Promise.race([waitForFrameAtOrAfter(video, time), timeoutPromise]);
    } catch (e) {
        // Timeout or error - just use current frame
        console.warn(`[Render] Frame wait timeout at ${time.toFixed(2)}s, using current frame`);
    }
};
