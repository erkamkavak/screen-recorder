type CachedAssetUrl = {
  url: string;
  isObjectUrl: boolean;
};

const urlCache: Map<string, CachedAssetUrl> = new Map();

const safeRevokeUrl = (url: string | undefined) => {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {}
};

const electronAPI = typeof window !== "undefined" ? window.electronAPI ?? null : null;

const readAssetBuffer = async (filePath: string): Promise<ArrayBuffer> => {
  if (!electronAPI?.readRecordingAsset) {
    throw new Error("Asset reading is not available");
  }
  return electronAPI.readRecordingAsset(filePath);
};

const tryGetFileUrlFromElectron = async (filePath: string): Promise<string | null> => {
  if (!electronAPI?.getRecordingAssetUrl) return null;
  try {
    return await electronAPI.getRecordingAssetUrl(filePath);
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

  const electronUrl = await tryGetFileUrlFromElectron(filePath);
  let url: string;
  let isObjectUrl = false;

  if (electronUrl) {
    url = electronUrl;
  } else {
    const buffer = await readAssetBuffer(filePath);
    const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
    url = URL.createObjectURL(blob);
    isObjectUrl = true;
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
