import { AudioSampleSink } from "mediabunny";
import { createAudioEncoder } from "./encoder";
import type { EncodedChunkWithMeta } from "./muxer";

/**
 * Adjust AudioData timestamp by creating a new instance with copied data
 */
export const adjustAudioTimestamp = (audioData: AudioData, newTimestamp: number): AudioData => {
    const buffer = new Float32Array(audioData.numberOfFrames * audioData.numberOfChannels);
    for (let ch = 0; ch < audioData.numberOfChannels; ch++) {
        audioData.copyTo(buffer.subarray(ch * audioData.numberOfFrames), { planeIndex: ch });
    }

    return new AudioData({
        format: audioData.format,
        sampleRate: audioData.sampleRate,
        numberOfFrames: audioData.numberOfFrames,
        numberOfChannels: audioData.numberOfChannels,
        timestamp: newTimestamp,
        data: buffer,
    });
};

export interface AudioProcessingSegment {
    sink: AudioSampleSink;
    trimStartUs: number;
    trimEndUs: number;
    timelineOffsetUs: number;
}

/**
 * Processes audio samples from one or more tracks, encodes them, and adds to encodedChunks.
 */
export const processAudioSegments = async (
    segments: AudioProcessingSegment[],
    encodedChunks: EncodedChunkWithMeta[],
    cancelToken?: { cancelled: boolean }
): Promise<void> => {
    let encoderError: Error | null = null;
    let audioEncoder: AudioEncoder | null = null;

    for (const segment of segments) {
        if (encoderError || cancelToken?.cancelled) break;

        const { sink, trimStartUs, trimEndUs, timelineOffsetUs } = segment;

        try {
            // @ts-ignore - Mediabunny sinks have a .samples() async iterator
            const sampleIterator = sink.samples ? sink.samples() : [];
            for await (const sample of sampleIterator) {
                if (cancelToken?.cancelled || encoderError) {
                    sample.close();
                    break;
                }

                const ts = sample.timestamp;
                if (ts < trimStartUs) {
                    sample.close();
                    continue;
                }
                if (ts > trimEndUs) {
                    sample.close();
                    break;
                }

                try {
                    const audioData = sample.toAudioData();
                    const relativeTs = (ts - trimStartUs) + timelineOffsetUs;

                    // Lazy init encoder with source parameters from the first segment
                    if (!audioEncoder) {
                        audioEncoder = await createAudioEncoder(
                            {
                                sampleRate: audioData.sampleRate,
                                numberOfChannels: audioData.numberOfChannels
                            },
                            (chunk, meta) => {
                                encodedChunks.push({ chunk, meta, type: "audio" });
                            },
                            (e) => {
                                console.error("[AudioProcessor] Encoder error:", e);
                                encoderError = e;
                            }
                        );
                    }

                    const adjustedData = adjustAudioTimestamp(audioData, relativeTs);
                    audioEncoder.encode(adjustedData);
                    audioData.close();
                    adjustedData.close();
                } finally {
                    sample.close();
                }
            }
        } catch (err) {
            console.warn("[AudioProcessor] Failed to process audio segment", err);
        }
    }

    if (audioEncoder && !encoderError) {
        await audioEncoder.flush().catch(e => console.error("[AudioProcessor] Flush failed", e));
        audioEncoder.close();
    }
};
