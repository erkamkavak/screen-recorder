/**
 * Video encoder configuration utilities
 * Handles AVC codec string generation and bitrate calculation
 */

import type { EncoderConfig } from "./types";

/**
 * Calculate the appropriate AVC level based on resolution
 * 
 * AVC levels and max macroblocks (each macroblock = 16x16 pixels):
 * - Level 3.1 (0x1F/31): 3,600 MBs = ~1280x720
 * - Level 4.0 (0x28/40): 8,192 MBs = ~1920x1088
 * - Level 4.2 (0x2A/42): 8,704 MBs = ~1920x1088
 * - Level 5.0 (0x32/50): 22,080 MBs = ~2560x1920
 * - Level 5.1 (0x33/51): 36,864 MBs = ~4096x2304
 * - Level 5.2 (0x34/52): 36,864 MBs = ~4096x2304
 * - Level 6.0 (0x3C/60): 139,264 MBs = ~8192x4320
 */
export const getAvcLevel = (width: number, height: number): string => {
    const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);

    if (macroblocks <= 3600) {
        return "1f"; // Level 3.1
    } else if (macroblocks <= 8192) {
        return "28"; // Level 4.0
    } else if (macroblocks <= 22080) {
        return "32"; // Level 5.0
    } else if (macroblocks <= 36864) {
        return "33"; // Level 5.1
    } else {
        return "3c"; // Level 6.0 for 8K
    }
};

/**
 * Generate the AVC codec string for a given resolution
 * Uses High profile (64) for better compression
 * Format: avc1.PPCCLL where PP=profile, CC=constraints, LL=level
 */
export const getAvcCodecString = (width: number, height: number): string => {
    const level = getAvcLevel(width, height);
    return `avc1.6400${level}`;
};

/**
 * Calculate appropriate bitrate based on resolution
 * 
 * Reference bitrates:
 * - 1080p: 20 Mbps (YouTube recommends 10-15 for upload)
 * - 4K: ~80 Mbps (YouTube recommends 35-68 for upload)
 * 
 * AVC Level limits:
 * - Level 5.1 max: 50 Mbps
 * - Level 5.2 max: 62.5 Mbps
 * - Level 6.0 max: 240 Mbps
 */
export const calculateBitrate = (width: number, height: number): number => {
    const pixels = width * height;
    const pixels1080p = 1920 * 1080;
    const bitrateScale = Math.max(1, pixels / pixels1080p);
    const baseBitrate = 4_000_000;
    return Math.round(baseBitrate * bitrateScale);
};

/**
 * Create a complete encoder configuration for the given resolution and frame rate
 */
export const createEncoderConfig = (
    width: number,
    height: number,
    frameRate: number
): EncoderConfig => {
    const codec = getAvcCodecString(width, height);
    const bitrate = calculateBitrate(width, height);
    const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);

    console.log(`[Encoder] Resolution: ${width}x${height}, macroblocks: ${macroblocks}`);
    console.log(`[Encoder] Target bitrate: ${(bitrate / 1_000_000).toFixed(1)} Mbps`);
    console.log(`[Encoder] Codec: ${codec}`);

    return {
        codec,
        width,
        height,
        bitrate,
        bitrateMode: "variable",
        latencyMode: "quality", // Better for offline rendering
        framerate: frameRate,
    };
};

/**
 * Configure a VideoEncoder with the given config
 */
export const configureEncoder = (
    encoder: VideoEncoder,
    config: EncoderConfig
): void => {
    const encoderConfig: VideoEncoderConfig = {
        codec: config.codec,
        width: config.width,
        height: config.height,
        bitrate: config.bitrate,
        bitrateMode: config.bitrateMode,
        latencyMode: config.latencyMode,
        framerate: config.framerate,
    };

    console.log("[Encoder] Config:", encoderConfig);
    encoder.configure(encoderConfig);
};

/**
 * Create and configure a new VideoEncoder
 */
export const createEncoder = (
    width: number,
    height: number,
    frameRate: number,
    onOutput: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void,
    onError: (error: DOMException) => void
): VideoEncoder => {
    const encoder = new VideoEncoder({
        output: onOutput,
        error: onError,
    });

    const config = createEncoderConfig(width, height, frameRate);
    configureEncoder(encoder, config);
    return encoder;
};

/**
 * Create and configure a new AudioEncoder
 */
export const createAudioEncoder = async (
    params: { sampleRate: number; numberOfChannels: number },
    onOutput: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void,
    onError: (error: DOMException) => void
): Promise<AudioEncoder> => {
    const encoder = new AudioEncoder({
        output: onOutput,
        error: onError,
    });

    const { sampleRate, numberOfChannels } = params;

    const configs: AudioEncoderConfig[] = [
        {
            codec: "mp4a.40.2", // AAC-LC
            numberOfChannels,
            sampleRate,
            bitrate: 128000,
        },
        {
            codec: "opus",
            numberOfChannels,
            sampleRate,
            bitrate: 128000,
        }
    ];

    let supportedConfig: AudioEncoderConfig | null = null;

    for (const config of configs) {
        try {
            const support = await AudioEncoder.isConfigSupported(config);
            if (support.supported) {
                supportedConfig = config;
                break;
            }
        } catch (e) {
            console.warn(`[Encoder] Check failed for ${config.codec}`, e);
        }
    }

    if (!supportedConfig) {
        // Fallback to first if none "officially" supported, or throw
        console.warn("[Encoder] No audio codec explicitly supported, trying AAC-LC");
        supportedConfig = configs[0];
    }

    console.log("[Encoder] Selected Audio Config:", supportedConfig);
    encoder.configure(supportedConfig);

    return encoder;
};
