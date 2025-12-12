/**
 * MP4 muxing utilities using mediabunny
 */

import {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    EncodedVideoPacketSource,
    EncodedPacket,
} from "mediabunny";

/**
 * Muxer state that holds the output and video source
 */
export interface MuxerState {
    output: Output;
    videoPacketSource: EncodedVideoPacketSource;
}

/**
 * Create a new muxer for MP4 output
 */
export const createMuxer = (frameRate: number): MuxerState => {
    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
    });

    const videoPacketSource = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(videoPacketSource, { frameRate });

    return { output, videoPacketSource };
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
    chunk: EncodedVideoChunk,
    isFirst: boolean,
    decoderConfig?: VideoDecoderConfig
): Promise<void> => {
    // Convert EncodedVideoChunk to mediabunny EncodedPacket
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    const packet = new EncodedPacket(
        data,
        chunk.type === "key" ? "key" : "delta",
        chunk.timestamp / 1_000_000, // Convert μs to seconds
        (chunk.duration ?? 0) / 1_000_000 // Convert μs to seconds
    );

    // First packet needs decoder config metadata
    if (isFirst && decoderConfig) {
        await state.videoPacketSource.add(packet, {
            decoderConfig: {
                codec: decoderConfig.codec,
                codedWidth: decoderConfig.codedWidth,
                codedHeight: decoderConfig.codedHeight,
                description: decoderConfig.description,
                colorSpace: decoderConfig.colorSpace,
            },
        });
    } else {
        await state.videoPacketSource.add(packet);
    }
};

/**
 * Finalize the muxer and get the output blob
 */
export const finalizeMuxer = async (state: MuxerState): Promise<Blob> => {
    state.videoPacketSource.close();
    await state.output.finalize();

    const buffer = (state.output.target as BufferTarget).buffer;
    return new Blob([buffer], { type: "video/mp4" });
};

/**
 * Encoded chunk with metadata for batch muxing
 */
export interface EncodedChunkWithMeta {
    chunk: EncodedVideoChunk;
    meta?: EncodedVideoChunkMetadata;
}

/**
 * Mux a batch of encoded chunks into an MP4 blob
 */
export const muxEncodedChunks = async (
    chunks: EncodedChunkWithMeta[],
    frameRate: number
): Promise<Blob> => {
    const state = createMuxer(frameRate);
    await startMuxer(state);

    // Sort chunks by timestamp (decode order should match presentation order for AVC baseline)
    const sortedChunks = [...chunks].sort((a, b) => a.chunk.timestamp - b.chunk.timestamp);

    // Find the first chunk with decoder config
    const firstMeta = sortedChunks.find((c) => c.meta?.decoderConfig)?.meta;

    for (let i = 0; i < sortedChunks.length; i++) {
        const { chunk } = sortedChunks[i];
        const isFirst = i === 0;
        await addEncodedChunk(state, chunk, isFirst, firstMeta?.decoderConfig);
    }

    return finalizeMuxer(state);
};
