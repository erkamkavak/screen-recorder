type CachedAssetUrl = {
  url: string;
  isObjectUrl: boolean;
};

import { backendAPI } from "./backendAPI";

const urlCache: Map<string, CachedAssetUrl> = new Map();

const safeRevokeUrl = (url: string | undefined) => {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {}
};

const readAssetBuffer = async (filePath: string): Promise<ArrayBuffer> => {
  const data = await backendAPI.readRecordingAsset(filePath) as unknown;
  // Tauri returns Vec<u8> as number[] or Uint8Array, convert to ArrayBuffer
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  // Handle array of numbers (Tauri's default serialization of Vec<u8>)
  if (Array.isArray(data)) {
    return new Uint8Array(data).buffer;
  }
  throw new Error("Unexpected data format from backend");
};

const tryGetFileUrlFromBackend = async (filePath: string): Promise<string | null> => {
  try {
    return await backendAPI.getRecordingAssetUrl(filePath);
  } catch {
    return null;
  }
};

export const getAssetUrlFromFile = async (
  filePath: string,
  mimeType?: string
): Promise<string> => {
  if (urlCache.has(filePath)) {
    return urlCache.get(filePath)!.url;
  }

  // Check if this is a video/audio file - WebKit has issues with custom protocols for media
  const isMediaFile = mimeType?.startsWith("video/") || mimeType?.startsWith("audio/") ||
    /\.(webm|mp4|mkv|avi|mov|mp3|wav|ogg|m4a)$/i.test(filePath);

  let url: string;
  let isObjectUrl = false;

  if (isMediaFile) {
    const buffer = await readAssetBuffer(filePath);
    const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
    url = URL.createObjectURL(blob);
    isObjectUrl = true;
  } else {
    const backendUrl = await tryGetFileUrlFromBackend(filePath);

    if (backendUrl) {
      url = backendUrl;
    } else {
      const buffer = await readAssetBuffer(filePath);
      const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
      url = URL.createObjectURL(blob);
      isObjectUrl = true;
    }
  }

  urlCache.set(filePath, { url, isObjectUrl });
  return url;
};

export const disposeAssetUrl = (filePath: string) => {
  const existing = urlCache.get(filePath);
  if (existing) {
    if (existing.isObjectUrl) {
      safeRevokeUrl(existing.url);
    }
    urlCache.delete(filePath);
  }
};

export const disposeAllAssetUrls = () => {
  urlCache.forEach(({ url, isObjectUrl }) => {
    if (isObjectUrl) {
      safeRevokeUrl(url);
    }
  });
  urlCache.clear();
};
