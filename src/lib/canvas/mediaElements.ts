export const waitForMetadata = (media: HTMLMediaElement, timeoutMs = 5000) =>
  new Promise<void>((resolve) => {
    if (media.readyState >= 1) {
      resolve();
      return;
    }
    let resolved = false;
    const onLoaded = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };
    const onCanPlay = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };
    const onError = () => {
      // let timeout handle it
    };
    const cleanup = () => {
      media.removeEventListener("loadedmetadata", onLoaded);
      media.removeEventListener("canplay", onCanPlay);
      media.removeEventListener("error", onError);
    };
    media.addEventListener("loadedmetadata", onLoaded);
    media.addEventListener("canplay", onCanPlay);
    media.addEventListener("error", onError);

    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    }, timeoutMs);
  });

export const createVideoElement = (src: string) => {
  const v = document.createElement("video");
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  v.playsInline = true;
  v.muted = true;
  v.src = src;
  v.load();
  return v;
};

export const createAudioElement = (src: string) => {
  const a = document.createElement("audio");
  a.src = src;
  a.crossOrigin = "anonymous";
  a.preload = "auto";
  a.load();
  return a;
};

export const loadImage = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};
