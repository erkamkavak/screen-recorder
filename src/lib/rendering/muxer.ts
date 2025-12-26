/**
 * MP4 muxing utilities using mediabunny
 */

import {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    EncodedVideoPacketSource,
    EncodedAudioPacketSource,
    EncodedPacket,
} from "mediabunny";

/**
 * Muxer state that holds the output and video source
 */
export interface MuxerState {
    output: Output;
    videoPacketSource: EncodedVideoPacketSource;
    audioPacketSource?: EncodedAudioPacketSource;
}

/**
 * Create a new muxer for MP4 output
 */
export const createMuxer = (frameRate: number, hasAudio = false, audioCodec = "aac"): MuxerState => {
    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
    });

    const videoPacketSource = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(videoPacketSource, { frameRate });

    let audioPacketSource: EncodedAudioPacketSource | undefined;
    if (hasAudio) {
        audioPacketSource = new EncodedAudioPacketSource(audioCodec as any);
        output.addAudioTrack(audioPacketSource);
    }

    return { output, videoPacketSource, audioPacketSource };
};

/**
 * Start the muxer (must be called before adding packets)
 */
export const startMuxer = async (state: MuxerState): Promise<void> => {
    await state.output.start();
};

/**
 * Add an encoded video chunk to the muxer
 */
export const addEncodedChunk = async (
    state: MuxerState,
    chunk: EncodedVideoChunk | EncodedAudioChunk,
    isFirst: boolean,
    decoderConfig?: VideoDecoderConfig | AudioDecoderConfig
): Promise<void> => {
    // Convert EncodedChunk to mediabunny EncodedPacket
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    const packet = new EncodedPacket(
        data,
        chunk.type === "key" ? "key" : "delta",
        chunk.timestamp / 1_000_000, // Convert μs to seconds
        (chunk.duration ?? 0) / 1_000_000 // Convert μs to seconds
    );

    const isVideo = chunk instanceof EncodedVideoChunk;
    const source = isVideo ? state.videoPacketSource : state.audioPacketSource;

    if (!source) return;

    // First packet needs decoder config metadata
    if (isFirst && decoderConfig) {
        if (isVideo) {
            const videoConfig = decoderConfig as VideoDecoderConfig;
            await (source as EncodedVideoPacketSource).add(packet, {
                decoderConfig: {
                    codec: videoConfig.codec,
                    codedWidth: videoConfig.codedWidth,
                    codedHeight: videoConfig.codedHeight,
                    description: videoConfig.description,
                    colorSpace: videoConfig.colorSpace,
                },
            });
        } else {
            const audioConfig = decoderConfig as AudioDecoderConfig;
            await (source as EncodedAudioPacketSource).add(packet, {
                decoderConfig: {
                    codec: audioConfig.codec,
                    sampleRate: audioConfig.sampleRate,
                    numberOfChannels: audioConfig.numberOfChannels,
                    description: audioConfig.description,
                },
            });
        }
    } else {
        await source.add(packet);
    }
};

/**
 * Finalize the muxer and get the output blob
 */
export const finalizeMuxer = async (state: MuxerState): Promise<Blob> => {
    state.videoPacketSource.close();
    state.audioPacketSource?.close();
    await state.output.finalize();

    const buffer = (state.output.target as BufferTarget).buffer;
    return new Blob([buffer], { type: "video/mp4" });
};

/**
 * Encoded chunk with metadata for batch muxing
 */
export interface EncodedChunkWithMeta {
    chunk: EncodedVideoChunk | EncodedAudioChunk;
    meta?: EncodedVideoChunkMetadata | EncodedAudioChunkMetadata;
    type: "video" | "audio";
}

/**
 * Mux a batch of encoded chunks into an MP4 blob
 */
export const muxEncodedChunks = async (
    chunks: EncodedChunkWithMeta[],
    frameRate: number
): Promise<Blob> => {
    const audioChunk = chunks.find((c) => c.type === "audio");
    const hasAudio = !!audioChunk;

    // Detect audio codec from chunks if possible
    let audioCodec = "aac";
    if (audioChunk && audioChunk.meta && "decoderConfig" in audioChunk.meta) {
        const config = audioChunk.meta.decoderConfig as AudioDecoderConfig;
        if (config.codec.includes("opus")) {
            audioCodec = "opus";
        }
    }

    const state = createMuxer(frameRate, hasAudio, audioCodec);
    await startMuxer(state);

    // Sort chunks by timestamp (presentation order)
    const sortedChunks = [...chunks].sort((a, b) => a.chunk.timestamp - b.chunk.timestamp);

    // Track if we've sent the first chunk of each type to include decoder config
    let firstVideoSent = false;
    let firstAudioSent = false;

    for (const { chunk, meta, type } of sortedChunks) {
        if (type === "video") {
            const isFirst = !firstVideoSent;
            const videoChunk = chunk as EncodedVideoChunk;
            const videoMeta = meta as EncodedVideoChunkMetadata;
            await addEncodedChunk(state, videoChunk, isFirst, videoMeta?.decoderConfig);
            if (isFirst) firstVideoSent = true;
        } else {
            const isFirst = !firstAudioSent;
            const audioChunk = chunk as EncodedAudioChunk;
            const audioMeta = meta as EncodedAudioChunkMetadata;
            await addEncodedChunk(state, audioChunk, isFirst, audioMeta?.decoderConfig);
            if (isFirst) firstAudioSent = true;
        }
    }

    return finalizeMuxer(state);
};
