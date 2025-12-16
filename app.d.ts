export {};

declare global {
  interface DesktopCaptureSourceSummary {
    id: string;
    name: string;
    thumbnail: string | null;
    type: "screen" | "window";
  }

  interface DesktopCaptureOptions {
    types?: Array<"screen" | "window" | string>;
    thumbnailSize?: {
      width: number;
      height: number;
    };
    preferredId?: string;
  }

  interface NativeCaptureTarget {
    type: "screen" | "window";
    id?: string; // xcap uses string IDs like "monitor:0" or "window:12345"
  }

  interface NativeCaptureFrame {
    width: number;
    height: number;
    timestampMs: number;
    format?: number;
    buffer: ArrayBuffer;
    pixels?: ArrayBuffer; // Legacy field for compatibility
    mouseX?: number | null;
    mouseY?: number | null;
    originX: number;
    originY: number;
  }

  interface NativeMouseEvent {
    timestampMs: number;
    x: number;
    y: number;
    normalizedX: number;
    normalizedY: number;
    buttonState: string; // "none", "left_down", "left_up", "right_down", "right_up", "middle_down", "middle_up"
    isPressed: boolean;
    cursorShape: string; // cursor shape name: "default", "pointer", "text", "crosshair", etc.
  }

  interface NativeRecordingOptions {
    targetId: string;
    captureType: string;
    includeCursor?: boolean;
    frameRate?: number;
    fileName?: string;
  }

  interface TranscriptionSegment {
    startMs: number;
    endMs: number;
    text: string;
    speaker?: string | null;
  }

  interface TranscriptionResult {
    provider: string;
    language?: string | null;
    segments: TranscriptionSegment[];
    raw?: string | null;
  }

  interface TranscriptionJobInfo {
    jobId: string;
    provider: string;
    status: string;
  }

  interface TranscriptionJobSnapshot {
    jobId: string;
    provider: string;
    status: string;
    errorMessage?: string | null;
    progress?: number | null;
  }

  interface ElectronAPI {
    // Desktop capture (Electron built-in)
    listDesktopSources?: (options?: DesktopCaptureOptions) => Promise<DesktopCaptureSourceSummary[]>;
    // Input capture
    startGlobalInputCapture?: () => void;
    stopGlobalInputCapture?: () => void;
    onGlobalInputEvent?: (listener: (event: any) => void) => () => void;
    
    // Recording assets
    saveRecordingAsset?: (payload: { fileName: string; buffer: ArrayBuffer }) => Promise<string>;
    cleanupRecordingAssets?: (paths: string[]) => Promise<void>;
    readRecordingAsset?: (path: string) => Promise<ArrayBuffer>;
    getRecordingAssetUrl?: (path: string) => Promise<string>;
    
    // Rendering
    startRenderStream?: (fileName: string) => Promise<string>;
    appendRenderChunk?: (payload: { filePath: string; buffer: ArrayBuffer }) => Promise<void>;
    patchRenderFile?: (payload: { filePath: string; durationMs: number; skipPatch?: boolean }) => Promise<boolean>;
    cancelRenderStream?: (filePath: string) => Promise<boolean>;
    closeRenderStream?: (filePath: string) => Promise<boolean>;
    saveRenderedFile?: (payload: { filePath: string; fileName: string }) => Promise<string | null>;
    
    // Native capture (streaming frames)
    startNativeCapture?: (options: NativeRecordingOptions) => Promise<boolean>;
    stopNativeCapture?: () => Promise<boolean>;
    pollNativeFrame?: () => Promise<NativeCaptureFrame | null>;
    
    // Native recording (Rust xcap-based, records to file)
    isNativeRecordingAvailable?: () => Promise<boolean>;
    listNativeSources?: () => Promise<DesktopCaptureSourceSummary[]>;
    startNativeRecording?: (options: NativeRecordingOptions) => Promise<string>;
    stopNativeRecording?: () => Promise<string>;
    // Native mouse position APIs (synced with Rust screen capture)
    getRecordingMouseEvents?: () => Promise<NativeMouseEvent[]>;
    clearRecordingMouseEvents?: () => Promise<boolean>;
    getCurrentMousePosition?: () => Promise<NativeMouseEvent | null>;

    // Native transcription
    listTranscriptionProviders?: () => Promise<string[]>;
    submitTranscription?: (request: any) => Promise<TranscriptionJobInfo>;
    getTranscriptionJob?: (jobId: string) => Promise<TranscriptionJobSnapshot | null>;
    getTranscriptionResult?: (jobId: string) => Promise<TranscriptionResult | null>;
    cancelTranscription?: (jobId: string) => Promise<boolean>;

    // Notes overlay
    showNotesOverlay?: () => void;
    hideNotesOverlay?: () => void;
    updateNotesOverlay?: (data: NotesOverlayData) => void;
    destroyNotesOverlay?: () => void;
    startNotesShortcuts?: () => void;
    stopNotesShortcuts?: () => void;
  }

  interface NotesOverlayData {
    visible?: boolean;
    text?: string;
    currentIndex?: number;
    totalCount?: number;
    notes?: Array<{ id: string; text: string }>;
    recording?: boolean;
    autoHide?: boolean;
    autoHideDelay?: number;
    shortcuts?: {
      next: NotesShortcutConfig;
      prev: NotesShortcutConfig;
      toggle: NotesShortcutConfig;
    };
  }

  interface NotesShortcutConfig {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    key: string;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }

  namespace svelte.JSX {
    interface HTMLAttributes<T> {
      onoutclick?: (event: CustomEvent<void>) => void;
    }
  }
}
