import { z } from "zod";
import { derived, writable } from "svelte/store";
import {
  createAudioBarBackground,
  createAudioWaveBackground,
  createLinearGradientBackground,
  createRainbowAudioBarBackground,
  createSolidBackground,
} from "../canvas/backgroundDrawers";

/**
 * Recording state
 */
export const recordingStartTime = writable<number | null>(null);
export const isRecording = derived(
  recordingStartTime,
  ($startTime) => $startTime !== null
);
export const recordingDuration = derived(
  recordingStartTime,
  ($startTime, set) => {
    if (!$startTime) return null;

    const setDuration = () => {
      const s = Math.floor((performance.now() - $startTime) / 1000);

      const numMins = Math.floor(s / 60);
      const numSecs = s % 60;

      set(`${numMins}:${String(numSecs).padStart(2, "0")}`);
    };

    setDuration();
    const interval = setInterval(setDuration, 500);

    return () => {
      set(null);
      clearInterval(interval);
    };
  },
  null
);

/**
 * Input event logging
 */
export type PointerEventRecord = {
  kind: "pointerdown" | "pointerup" | "click" | "pointermove";
  t: number; // ms since recordingStartTime
  // normalized coordinates (0..1) within active screen area
  x?: number;
  y?: number;
  button?: number;
  cursorShape?: string; // "default", "pointer", "text", "crosshair", "move", "wait", etc.
};
export type KeyEventRecord = {
  kind: "keydown" | "keyup";
  t: number; // ms since recordingStartTime
  key: string;
  code?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};
export type InputEventRecord = PointerEventRecord | KeyEventRecord;

export const inputEvents = writable<InputEventRecord[]>([]);

export type RecordingAssetType = "screen" | "webcam" | "mouse" | "audio";

export type RecordingAsset = {
  type: RecordingAssetType;
  fileName: string;
  filePath: string;
  mimeType?: string;
};

export type RecordingAssets = Partial<Record<RecordingAssetType, RecordingAsset>>;

export type RecordingSegment = {
  id: string;
  assets: RecordingAssets;
  events: InputEventRecord[];
  startOffset: number; // ms from project start
  duration: number; // original duration in ms
  trimStart: number; // ms trimmed from beginning
  trimEnd: number; // ms trimmed from end
};

export type RecordingProject = {
  id?: string;
  name?: string;
  segments: RecordingSegment[];
  totalDuration: number; // computed from segments
  fileName: string;
  previewPath?: string;
  reviewState?: any;
};

export type LastRecording = {
  assets: RecordingAssets;
  events: InputEventRecord[];
  fileName: string;
  duration: number;
  previewPath?: string;
  // Segment-based fields
  segments?: RecordingSegment[];
  projectId?: string;
  reviewState?: any;
} | null;
export const lastRecording = writable<LastRecording>(null);

export const currentProject = writable<RecordingProject | null>(null);

export type AppView = "recorder" | "review";
export const appView = writable<AppView>("recorder");

export const showFloatingControls = (() => {
  const init = localStorage.getItem("showFloatingControls") === "true";
  const store = writable(init);

  store.subscribe((value) => {
    localStorage.setItem("showFloatingControls", String(value));
  });

  return store;
})();


// Sidebar tabs
export type SidebarTab = "layout" | "webcam" | "mic" | "notes";
export const activeSidebarTab = writable<SidebarTab>("layout");


export const recordingFPS = (() => {
  const initFps = localStorage.getItem("recordingFps");
  const store = writable(Number(initFps) || 30);

  const _set = store.set;
  store.set = (fps) => {
    localStorage.setItem("recordingFps", String(fps));
    _set(fps);
  };

  return store;
})();

/**
 * Track video stream
 */
export type Share = {
  id: string;
  stream?: MediaStream;
  preview?: HTMLVideoElement;
  width: number;
  height: number;
  stopNativeCapture?: () => void;
};

export type ScreenShareState = {
  activeIndex: null | number;
  shares: Share[];
};
export const screenShareState = writable<ScreenShareState>({
  activeIndex: 0,
  shares: [],
});

export const activeShare = derived(screenShareState, ($state) => {
  return $state.shares[$state.activeIndex];
});

export const displayStream = derived(screenShareState, ($state) => {
  if ($state.activeIndex === null || $state.shares.length === 0) return null;
  return $state.shares[$state.activeIndex].stream;
});
export const displayPreview = derived(screenShareState, ($state) => {
  if ($state.activeIndex === null || $state.shares.length === 0) return null;
  return $state.shares[$state.activeIndex].preview;
});
export const displayDimensions = derived(screenShareState, ($state) => {
  if ($state.activeIndex === null || $state.shares.length === 0) return null;
  return {
    width: $state.shares[$state.activeIndex].width,
    height: $state.shares[$state.activeIndex].height,
  };
});

/**
 * Track webcam stream
 */
export type WebcamState = {
  deviceId?: string | null;
  stream?: MediaStream | null;
  preview?: HTMLVideoElement | null;
  width: number;
  height: number;
};
export const webcamState = writable<WebcamState>({ width: 0, height: 0 });

/**
 * Mic stream
 */
export const micState = writable<{
  stream?: MediaStream | null;
  deviceId?: string | null;
}>({});

export const micAnalyzer = derived(micState, ($micState) => {
  if (!$micState.stream) return null;
  const $stream = $micState.stream;
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 128;
  // Set min/max decibels so bars aren't going too far over 100% of height
  analyser.minDecibels = -90;
  analyser.maxDecibels = -15;

  const source = context.createMediaStreamSource($stream);
  source.connect(analyser);

  // analyser.connect(context.destination);

  let freqs = new Uint8Array(analyser.frequencyBinCount);

  return { freqs, analyser };
});

/**
 * Canvas stream
 */
export const canvasStream = writable<MediaStream>(null);

export const previewScreenshotCapture = writable<(() => Promise<Blob | null>) | null>(null);

/**
 * Mouse overlay stream
 */
export const mouseCursorStream = writable<MediaStream>(null);

/**
 * Canvas sizes
 */
export type CanvasSize = {
  title: string;
  width: number;
  height: number;
};

export const canvasSizes: CanvasSize[] = [
  { title: "4K", width: 3840, height: 2160 },
  { title: "2K", width: 2560, height: 1440 },
  { title: "1080p", width: 1920, height: 1080 },
  { title: "Square", width: 1920, height: 1920 },
  { title: "Portrait", width: 1000, height: 1800 },
];

export const recordingFPSOptions: number[] = [30, 60];

export const canvasDimensions = (() => {
  const initSizeName = localStorage.getItem("canvasSize");
  const initSize =
    canvasSizes.find((size) => size.title === initSizeName) || canvasSizes[0];
  const store = writable<CanvasSize>(initSize);

  const _set = store.set;
  store.set = (size) => {
    localStorage.setItem("canvasSize", size.title);
    _set(size);
  };

  return store;
})();

/**
 * Theming
 */
export type Theme = {
  title: string;
  primary: string;
  secondary: string;
  accent: string;
};
export const themes: Theme[] = [
  {
    title: "Closed Eyes in the Sun",
    primary: "#FF3F2A",
    secondary: "#ff7328",
    accent: "#FFFFFF",
  },
  {
    title: "Tange-orange",
    primary: "#FF952A",
    secondary: "#FFD452",
    accent: "#FFFFFF",
  },
  {
    title: "Jungle-Chic",
    primary: "#69C647",
    secondary: "#38BC7F",
    accent: "#FFFFFF",
  },
  {
    title: "World's Most Generic Blues",
    primary: "#299FD2",
    secondary: "#2956D2",
    accent: "#FFFFFF",
  },
  {
    title: "Irises with Lavenders",
    primary: "#3A29D2",
    secondary: "#8029D2",
    accent: "#FFFFFF",
  },
  {
    title: "(Un)Opinionatedly-Blue Grays",
    primary: "#1d1e21",
    secondary: "#34373d",
    accent: "#FFFFFF",
  },
  {
    title: "Steam-Pressed Shirt",
    primary: "#edf0f9",
    secondary: "#f7f8fc",
    accent: "#FFFFFF",
  },
];

export const userThemes = (() => {
  const stored = localStorage.getItem("userThemes");
  const init = stored ? JSON.parse(stored) : [];
  const store = writable<Theme[]>(init);

  store.subscribe((themes) => {
    localStorage.setItem("userThemes", JSON.stringify(themes));
  });

  return store;
})();

export const activeTheme = (() => {
  const initThemeTitle = localStorage.getItem("theme");
  const storedUserThemes = JSON.parse(localStorage.getItem("userThemes") || "[]");

  const initTheme =
    themes.find((t) => t.title === initThemeTitle) ||
    storedUserThemes.find((t: Theme) => t.title === initThemeTitle) ||
    (initThemeTitle === "customTheme" ? JSON.parse(localStorage.getItem("customTheme") || "null") : null) ||
    themes[0];

  const store = writable<Theme>(initTheme);
  const _set = store.set;

  store.set = (theme) => {
    localStorage.setItem("theme", theme.title);
    _set(theme);
  };

  return store;
})();

export const customTheme = (() => {
  const initCustomTheme = JSON.parse(localStorage.getItem("customTheme")) || {
    ...themes[0],
    title: "customTheme"
  };

  const store = writable<Theme>(initCustomTheme);
  const _set = store.set;

  store.set = (theme) => {
    const themeWithTitle = { ...theme, title: "customTheme" };
    localStorage.setItem("customTheme", JSON.stringify(themeWithTitle));
    _set(themeWithTitle);
    activeTheme.set(themeWithTitle);
  };
  return store;
})();

/**
 * ------------------------------
 * Background/layout drawing stuff
 * ------------------------------
 */
export type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type DrawArgs = {
  ctx: Canvas2DContext;
  theme: Theme;
  canvasSize: CanvasSize;
  activeShare: ScreenShareState["shares"][number] | null | undefined;
  webcamState: WebcamState;
  micAnalyzer: null | { freqs: Uint8Array; analyser: AnalyserNode };
  generalLayoutState: GeneralLayoutState;
  webcamLayoutState: WebcamLayoutState;
  screenLayoutState: ScreenState;
  screenFrame?: CanvasImageSource | VideoFrame;
  webcamFrame?: CanvasImageSource | VideoFrame;
};
export type DrawFn = (
  args: DrawArgs,
  webcamX?: number,
  webcamY?: number
) => void;

export type BackgroundCategories = "Audio" | "Gradient" | "Solid" | "Image";

/**
 * Background
 */
export type Background = {
  title: string;
  category: BackgroundCategories;
  ariaLabel: string;
  draw: DrawFn;
};

export type CustomBackgroundImage = {
  src: string;
  name?: string;
} | null;

let customBackgroundImageElement: HTMLImageElement | null = null;

const ensureCustomBackgroundImageElement = (src: string | null) => {
  if (!src) {
    customBackgroundImageElement = null;
    return;
  }

  if (!customBackgroundImageElement) {
    customBackgroundImageElement = new Image();
  }

  if (customBackgroundImageElement.src !== src) {
    customBackgroundImageElement.src = src;
  }
};

const fallbackImageBackground = createLinearGradientBackground("bottom_right");

const drawCustomImageBackground: DrawFn = (args) => {
  if (
    customBackgroundImageElement &&
    customBackgroundImageElement.complete &&
    customBackgroundImageElement.naturalWidth &&
    customBackgroundImageElement.naturalHeight
  ) {
    args.ctx.save();
    args.ctx.drawImage(
      customBackgroundImageElement,
      0,
      0,
      args.canvasSize.width,
      args.canvasSize.height
    );
    args.ctx.restore();
  } else {
    fallbackImageBackground(args);
  }
};

const initCustomBackgroundImage: CustomBackgroundImage = (() => {
  try {
    const stored = localStorage.getItem("customBackgroundImage");
    return stored ? (JSON.parse(stored) as CustomBackgroundImage) : null;
  } catch {
    return null;
  }
})();

ensureCustomBackgroundImageElement(initCustomBackgroundImage?.src ?? null);

export const backgrounds: Background[] = [
  {
    title: "Thin",
    ariaLabel: "Thin bars",
    category: "Audio",
    draw: createAudioBarBackground({ N: 2 }),
  },
  {
    title: "Medium",
    ariaLabel: "Medium bars",
    category: "Audio",
    draw: createAudioBarBackground({ N: 4 }),
  },
  {
    title: "Thick",
    ariaLabel: "Thick bars",
    category: "Audio",
    draw: createAudioBarBackground({ N: 8 }),
  },
  {
    title: "Wave",
    ariaLabel: "Wave",
    category: "Audio",
    draw: createAudioWaveBackground(),
  },
  {
    title: "Rainbow",
    category: "Audio",
    ariaLabel: "Rainbow bars",
    draw: createRainbowAudioBarBackground({
      N: 2,
      initHue: 0,
      gapPercent: 0.003,
    }),
  },
  {
    title: "↘",
    ariaLabel: "Gradient to bottom right",
    category: "Gradient",
    draw: createLinearGradientBackground("bottom_right"),
  },
  {
    title: "↑",
    ariaLabel: "Gradient to top",
    category: "Gradient",
    draw: createLinearGradientBackground("top"),
  },
  {
    title: "↓",
    ariaLabel: "Gradient to bottom",
    category: "Gradient",
    draw: createLinearGradientBackground("bottom"),
  },
  {
    title: "←",
    ariaLabel: "Gradient to left",
    category: "Gradient",
    draw: createLinearGradientBackground("left"),
  },
  {
    title: "→",
    ariaLabel: "Gradient to right",
    category: "Gradient",
    draw: createLinearGradientBackground("right"),
  },
  {
    title: "Primary",
    ariaLabel: "Solid primary color",
    category: "Solid",
    draw: createSolidBackground("primary"),
  },
  {
    title: "Secondary",
    ariaLabel: "Solid secondary color",
    category: "Solid",
    draw: createSolidBackground("secondary"),
  },
  {
    title: "Custom image",
    ariaLabel: "Uploaded image background",
    category: "Image",
    draw: drawCustomImageBackground,
  },
];

export const activeBackground = (() => {
  const initBackgroundTitle = localStorage.getItem("background");
  const initBackground =
    backgrounds.find(
      (background) => background.title === initBackgroundTitle
    ) || backgrounds[1];
  const store = writable<Background>(initBackground);

  const _set = store.set;
  store.set = (background) => {
    localStorage.setItem("background", background.title);
    _set(background);
  };

  return store;
})();

export const customBackgroundImage = (() => {
  const store = writable<CustomBackgroundImage>(initCustomBackgroundImage);
  store.subscribe((value) => {
    if (value) {
      try {
        localStorage.setItem("customBackgroundImage", JSON.stringify(value));
      } catch { }
      ensureCustomBackgroundImageElement(value.src);
    } else {
      try {
        localStorage.removeItem("customBackgroundImage");
      } catch { }
      ensureCustomBackgroundImageElement(null);
    }
  });
  return store;
})();

/**
 * General layout state
 */
const generalLayoutStateSchema = z.object({
  padding: z.number().min(0).max(1).optional().default(0.1),
});
export type GeneralLayoutState = z.infer<typeof generalLayoutStateSchema>;

export const generalLayoutState = (() => {
  let initGeneralLayoutState: GeneralLayoutState = {};
  try {
    const storedWebcamState = localStorage.getItem("generalLayoutState");
    initGeneralLayoutState = generalLayoutStateSchema.parse(
      storedWebcamState
        ? JSON.parse(storedWebcamState)
        : generalLayoutStateSchema.parse({})
    );
  } catch { }

  const store = writable<GeneralLayoutState>(initGeneralLayoutState);

  const _set = store.set;
  store.set = (layoutState) => {
    try {
      localStorage.setItem("generalLayoutState", JSON.stringify(layoutState));
    } catch { }
    _set(layoutState);
  };

  return store;
})();

/**
 * Webcam state
 */
export enum HorizAlign {
  left = "left",
  center = "center",
  right = "right",
}

export enum VertAlign {
  top = "top",
  center = "center",
  bottom = "bottom",
}

export enum WebcamShape {
  rectangle = "rectangle",
  circle = "circle",
}

export const horizontalAlignmentOptions = [
  HorizAlign.left,
  HorizAlign.center,
  HorizAlign.right,
] as const;
export const verticalAlignmentOptions = [
  VertAlign.top,
  VertAlign.center,
  VertAlign.bottom,
] as const;
export const webcamShapeOptions = [WebcamShape.circle, WebcamShape.rectangle] as const;

const webcamStateSchema = z.object({
  horizAlign: z
    .enum(horizontalAlignmentOptions)
    .optional()
    .default(HorizAlign.right),
  vertAlign: z
    .enum(verticalAlignmentOptions)
    .optional()
    .default(VertAlign.bottom),
  shape: z.enum(webcamShapeOptions).optional().default(WebcamShape.circle),
  size: z.number().min(0).max(1).optional().default(0.28),
  borderRadius: z.number().min(0).max(5).optional().default(0.05),
  padding: z.number().min(0).max(0.3).optional().default(0.06),
  borderWidth: z.number().min(0).max(20).optional().default(0),
  borderColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}){1,2}$/)
    .optional()
    .default("#FFFFFF"),
  shadowBlur: z.number().min(0).max(60).optional().default(18),
  shadowOpacity: z.number().min(0).max(1).optional().default(0.25),
  position: z
    .enum([
      "custom",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "top-center",
      "bottom-center",
      "center",
      "right-center",
      "left-center"
    ])
    .optional()
    .default("bottom-right"),
  offsetX: z.number().min(0).max(1).optional().default(1),
  offsetY: z.number().min(0).max(1).optional().default(1),
});
export type WebcamLayoutState = z.infer<typeof webcamStateSchema>;

export const webcamLayoutState = (() => {
  let initWebcamState: WebcamLayoutState = {};
  try {
    const storedWebcamState = localStorage.getItem("webcamState");
    initWebcamState = webcamStateSchema.parse(
      storedWebcamState
        ? JSON.parse(storedWebcamState)
        : webcamStateSchema.parse({})
    );
  } catch { }

  const store = writable<WebcamLayoutState>(initWebcamState);

  const _set = store.set;
  store.set = (webcamState) => {
    try {
      localStorage.setItem("webcamState", JSON.stringify(webcamState));
    } catch { }
    _set(webcamState);
  };

  const _update = store.update;
  store.update = (updater) => {
    _update((current) => {
      const next = updater(current);
      try {
        localStorage.setItem("webcamState", JSON.stringify(next));
      } catch { }
      return next;
    });
  };

  return store;
})();

/**
 * Screen/display state
 */
const screenStateSchema = z.object({
  horizAlign: z
    .enum(horizontalAlignmentOptions)
    .optional()
    .default(HorizAlign.center),
  vertAlign: z
    .enum(verticalAlignmentOptions)
    .optional()
    .default(VertAlign.center),
  // TODO: border radius?
});
export type ScreenState = z.infer<typeof screenStateSchema>;

export const screenLayoutState = (() => {
  let initScreenState: ScreenState = {
    horizAlign: HorizAlign.center,
    vertAlign: VertAlign.center,
  };
  try {
    const storedScreenState = localStorage.getItem("screenState");
    if (storedScreenState) {
      initScreenState = screenStateSchema.parse(JSON.parse(storedScreenState));
    }
  } catch { }

  const store = writable<ScreenState>(initScreenState);

  const _set = store.set;
  store.set = (screenState) => {
    try {
      localStorage.setItem("screenState", JSON.stringify(screenState));
    } catch { }
    _set(screenState);
  };

  return store;
})();
