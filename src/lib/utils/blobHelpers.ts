import fixWebmDuration from "fix-webm-duration";

/**
 * MediaRecorder produces a garbage blob that doesn't have duration metadata.
 * Only patch formats that still suffer from the issue (i.e. WebM).
 */
export const patchBlob = (blob: Blob, duration: number): Promise<Blob> => {
  if (!blob.type?.includes("webm")) {
    return Promise.resolve(blob);
  }
  return new Promise((resolve) => {
    fixWebmDuration(blob, duration, (newBlob) => resolve(newBlob), {
      logger: false,
    });
  });
};
