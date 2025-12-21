/**
 * Multi-segment rendering support
 * Handles loading and coordinating multiple video segments for rendering
 */

import { Input, MP4, WEBM, UrlSource, VideoSampleSink } from "mediabunny";
import type { VideoSample } from "mediabunny";
import type { RecordingSegment, RecordingAssets } from "../stores";
import { getAssetUrlFromFile } from "../backend/assetStorage";
import { createVideoElement, waitForMetadata } from "./videoUtils";

export interface SegmentSource {
    segment: RecordingSegment;
    screenUrl: string;
    webcamUrl: string | null;
    screenInput: Input;
    webcamInput: Input | null;
    screenSink: VideoSampleSink;
    webcamSink: VideoSampleSink | null;
    screenVideo: HTMLVideoElement;
    webcamVideo: HTMLVideoElement | null;
}

export interface SegmentTimeInfo {
    segmentIndex: number;
    localTime: number; // Time within the segment (seconds)
    segment: RecordingSegment;
}

/**
 * Calculate which segment a given timeline time falls into
 */
export const getSegmentForTime = (
    segments: RecordingSegment[],
    timelineSec: number
): SegmentTimeInfo | null => {
    let accumulatedTime = 0;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const effectiveDuration = Math.max(0, (segment.duration - segment.trimStart - segment.trimEnd) / 1000);
        const trimStartSec = Math.max(0, segment.trimStart / 1000);
        const trimEndSec = Math.max(0, segment.trimEnd / 1000);
        const segmentEndSec = Math.max(trimStartSec, (segment.duration / 1000) - trimEndSec);

        // Use a small epsilon for boundary checks to avoid floating point issues
        if (timelineSec <= accumulatedTime + effectiveDuration + 0.0001) {
            // This is the segment we need
            const localTime = Math.max(
                trimStartSec,
                Math.min(
                    segmentEndSec,
                    (timelineSec - accumulatedTime) + trimStartSec
                )
            );
            return {
                segmentIndex: i,
                localTime,
                segment,
            };
        }

        accumulatedTime += effectiveDuration;
    }

    // If we're past all segments, return the last one at its end
    if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        return {
            segmentIndex: segments.length - 1,
            localTime: (lastSegment.duration - lastSegment.trimEnd) / 1000,
            segment: lastSegment,
        };
    }

    return null;
};

/**
 * Calculate total effective duration of all segments
 */
export const getTotalSegmentsDuration = (segments: RecordingSegment[]): number => {
    return segments.reduce(
        (sum, seg) => sum + (seg.duration - seg.trimStart - seg.trimEnd),
        0
    );
};

/**
 * Load all segment sources for rendering
 */
export const loadSegmentSources = async (
    segments: RecordingSegment[],
    showWebcam: boolean
): Promise<SegmentSource[]> => {
    const sources: SegmentSource[] = [];

    for (const segment of segments) {
        const screenAsset = segment.assets.screen;
        if (!screenAsset) {
            console.warn(`Segment ${segment.id} has no screen asset, skipping`);
            continue;
        }

        try {
            const screenUrl = await getAssetUrlFromFile(screenAsset.filePath);
            if (!screenUrl) {
                console.warn(`Unable to load screen URL for segment ${segment.id}`);
                continue;
            }

            const webcamAsset = segment.assets.webcam;
            const webcamUrl = showWebcam && webcamAsset
                ? await getAssetUrlFromFile(webcamAsset.filePath)
                : null;

            // Create video elements for metadata
            const screenVideo = createVideoElement(screenUrl);
            const webcamVideo = webcamUrl ? createVideoElement(webcamUrl) : null;
            await Promise.all([
                waitForMetadata(screenVideo),
                webcamVideo ? waitForMetadata(webcamVideo) : Promise.resolve()
            ]);

            // Create mediabunny inputs
            const screenInput = new Input({
                formats: [MP4, WEBM],
                source: new UrlSource(screenUrl),
            });
            const webcamInput = webcamUrl
                ? new Input({
                    formats: [MP4, WEBM],
                    source: new UrlSource(webcamUrl),
                })
                : null;

            const screenTrack = await screenInput.getPrimaryVideoTrack();
            if (!screenTrack) {
                screenInput.dispose();
                webcamInput?.dispose();
                console.warn(`Segment ${segment.id} screen has no video track`);
                continue;
            }

            const webcamTrack = webcamInput ? await webcamInput.getPrimaryVideoTrack() : null;

            const screenSink = new VideoSampleSink(screenTrack);
            const webcamSink = webcamTrack ? new VideoSampleSink(webcamTrack) : null;

            sources.push({
                segment,
                screenUrl,
                webcamUrl,
                screenInput,
                webcamInput,
                screenSink,
                webcamSink,
                screenVideo,
                webcamVideo,
            });
        } catch (error) {
            console.error(`Failed to load segment ${segment.id}:`, error);
        }
    }

    return sources;
};

/**
 * Dispose all segment sources
 */
export const disposeSegmentSources = (sources: SegmentSource[]) => {
    for (const source of sources) {
        try { source.screenInput.dispose(); } catch { }
        try { source.webcamInput?.dispose(); } catch { }
        try {
            source.screenVideo.src = "";
            source.screenVideo.load();
            source.screenVideo.remove();
        } catch { }
        if (source.webcamVideo) {
            try {
                source.webcamVideo.src = "";
                source.webcamVideo.load();
                source.webcamVideo.remove();
            } catch { }
        }
    }
};

/**
 * Get a frame from the appropriate segment at a given timeline time
 */
export const getSegmentFrameAtTime = async (
    sources: SegmentSource[],
    segments: RecordingSegment[],
    timelineSec: number,
    createFallbackBitmap: () => Promise<ImageBitmap>
): Promise<{
    screenBitmap: ImageBitmap;
    webcamBitmap: ImageBitmap | null;
    segmentIndex: number;
}> => {
    const timeInfo = getSegmentForTime(segments, timelineSec);

    if (!timeInfo) {
        return {
            screenBitmap: await createFallbackBitmap(),
            webcamBitmap: null,
            segmentIndex: -1,
        };
    }

    const source = sources.find(s => s.segment.id === timeInfo.segment.id);
    if (!source) {
        return {
            screenBitmap: await createFallbackBitmap(),
            webcamBitmap: null,
            segmentIndex: timeInfo.segmentIndex,
        };
    }

    // Get samples at the local time within the segment
    const localTimestamps = [timeInfo.localTime];

    let screenBitmap: ImageBitmap;
    let webcamBitmap: ImageBitmap | null = null;

    try {
        const screenIterator = source.screenSink.samplesAtTimestamps(localTimestamps)[Symbol.asyncIterator]();
        const screenNext = await screenIterator.next();
        const screenSample = screenNext.done ? null : (screenNext.value ?? null) as VideoSample | null;

        if (screenSample) {
            screenBitmap = await createImageBitmap(screenSample.toCanvasImageSource());
            screenSample.close();
        } else {
            screenBitmap = await createFallbackBitmap();
        }

        if (source.webcamSink) {
            const webcamIterator = source.webcamSink.samplesAtTimestamps(localTimestamps)[Symbol.asyncIterator]();
            const webcamNext = await webcamIterator.next();
            const webcamSample = webcamNext.done ? null : (webcamNext.value ?? null) as VideoSample | null;

            if (webcamSample) {
                webcamBitmap = await createImageBitmap(webcamSample.toCanvasImageSource());
                webcamSample.close();
            }
        }
    } catch (error) {
        console.warn(`Error getting frame at ${timelineSec}s:`, error);
        screenBitmap = await createFallbackBitmap();
    }

    return {
        screenBitmap,
        webcamBitmap,
        segmentIndex: timeInfo.segmentIndex,
    };
};
