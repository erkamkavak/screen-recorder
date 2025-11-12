export const getPreferredMimeType = () => {
  // Strongly prefer webm with VP9/VP8 to avoid Electron ffmpeg pixel format issues
  const preferred: { mimeType: string; ext: string }[] = [
    { mimeType: "video/webm;codecs=vp9", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];
  const fallbackList = [...preferred, ...MIME_TYPES];
  const found = fallbackList.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m.mimeType);
    } catch {
      return false;
    }
  });
  // Final fallback to bare webm
  return found ?? { mimeType: "video/webm", ext: "webm" };
};

const MEDIA_TYPES = ["video"];
const FILE_EXTENSIONS = ["webm", "ogg", "x-matroska", "mp4"]; // favor webm first
const CODECS = [
  "vp9",
  "vp9.0",
  "vp8",
  "vp8.0",
  "avc1",
  "av1",
  "h265",
  "h.265",
  "h264",
  "h.264",
  "opus",
];

const MIME_TYPES: { mimeType: string; ext: string }[] = [...new Set(
  FILE_EXTENSIONS.flatMap((ext) =>
    CODECS.flatMap((codec) =>
      MEDIA_TYPES.flatMap((mediaType) => [
        { mimeType: `${mediaType}/${ext};codecs:${codec}` as const, ext },
        { mimeType: `${mediaType}/${ext};codecs=${codec}` as const, ext },
        { mimeType: `${mediaType}/${ext};codecs:${codec.toUpperCase()}` as const, ext },
        { mimeType: `${mediaType}/${ext};codecs=${codec.toUpperCase()}` as const, ext },
        { mimeType: `${mediaType}/${ext}` as const, ext },
      ])
    )
  )
)];
