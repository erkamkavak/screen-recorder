/**
 * Unified Backend API - provides consistent interface across Electron and Tauri backends
 */

// Type definitions for backend APIs
export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string | null;
  type: "screen" | "window";
}

export interface InputEventPayload {
  kind: "click" | "pointerdown" | "pointerup" | "pointermove" | "keydown" | "keyup";
  x?: number;
  y?: number;
  button?: number;
  key?: string;
  code?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

// Runtime detection
const isElectron =
  typeof window !== "undefined" &&
  typeof (window as any).electronAPI !== "undefined";
const isTauri = false; // Tauri support removed

// Desktop Capture APIs
export const listDesktopSources = async (options?: any): Promise<DesktopSource[]> => {
  if (isElectron) {
    // Prefer native sources via xcap; fall back to Electron desktopCapturer
    try {
      const nativeAvailable = await window.electronAPI.isNativeRecordingAvailable?.();
      if (nativeAvailable) {
        const nativeSources = await window.electronAPI.listNativeSources?.();
        if (nativeSources?.length) {
          return nativeSources;
        }
      }
    } catch (e) {
      console.warn("Native sources not available, using Electron desktopCapturer:", e);
    }
    return await window.electronAPI.listDesktopSources(options);
  }

  throw new Error("Desktop capture sources not available outside Electron");
};

// Native transcription APIs
export const listTranscriptionProviders = async (): Promise<string[]> => {
  if (isElectron) {
    try {
      return await window.electronAPI.listTranscriptionProviders?.() ?? [];
    } catch (error) {
      console.error("Failed to list transcription providers:", error);
      return [];
    }
  }
  throw new Error("Transcription not available outside Electron");
};

export const submitTranscription = async (request: any): Promise<TranscriptionJobInfo> => {
  if (isElectron) {
    const result = await window.electronAPI.submitTranscription?.(request);
    if (!result) {
      throw new Error("Transcription API not available");
    }
    return result;
  }
  throw new Error("Transcription not available outside Electron");
};

export const getTranscriptionJob = async (jobId: string): Promise<TranscriptionJobSnapshot | null> => {
  if (isElectron) {
    return await window.electronAPI.getTranscriptionJob?.(jobId) ?? null;
  }
  throw new Error("Transcription not available outside Electron");
};

export const getTranscriptionResult = async (jobId: string): Promise<TranscriptionResult | null> => {
  if (isElectron) {
    return await window.electronAPI.getTranscriptionResult?.(jobId) ?? null;
  }
  throw new Error("Transcription not available outside Electron");
};

export const cancelTranscription = async (jobId: string): Promise<boolean> => {
  if (isElectron) {
    return await window.electronAPI.cancelTranscription?.(jobId) ?? false;
  }
  throw new Error("Transcription not available outside Electron");
};

// Input Capture APIs
export const startGlobalInputCapture = async (): Promise<void> => {
  if (isElectron) {
    window.electronAPI.startGlobalInputCapture();
    return;
  }

  throw new Error("Input capture not available outside Electron");
};

export const stopGlobalInputCapture = async (): Promise<void> => {
  if (isElectron) {
    window.electronAPI.stopGlobalInputCapture();
    return;
  }

  throw new Error("Input capture not available outside Electron");
};

export const onGlobalInputEvent = (callback: (event: InputEventPayload) => void): (() => void) => {
  if (isElectron) {
    return window.electronAPI.onGlobalInputEvent(callback);
  }

  throw new Error("Input capture events not available outside Electron");
};

// File/Asset Management APIs
export const saveRecordingAsset = async (fileName: string, buffer: ArrayBuffer): Promise<string> => {
  if (isElectron) {
    return await window.electronAPI.saveRecordingAsset({ fileName, buffer });
  }

  throw new Error("Asset saving not available outside Electron");
};

export const cleanupRecordingAssets = async (paths: string[]): Promise<boolean> => {
  if (isElectron) {
    await window.electronAPI.cleanupRecordingAssets(paths);
    return true; // Electron API returns void, but we return boolean for consistency
  }

  throw new Error("Asset cleanup not available outside Electron");
};

export const readRecordingAsset = async (filePath: string): Promise<ArrayBuffer> => {
  if (isElectron) {
    return await window.electronAPI.readRecordingAsset(filePath);
  }

  throw new Error("Asset reading not available outside Electron");
};

export const getRecordingAssetUrl = async (filePath: string): Promise<string> => {
  if (isElectron) {
    return await window.electronAPI.getRecordingAssetUrl(filePath);
  }

  throw new Error("Asset URL generation not available outside Electron");
};

// Rendering APIs
export const startRenderStream = async (fileName?: string): Promise<string> => {
  if (isElectron) {
    return await window.electronAPI.startRenderStream(fileName);
  }

  throw new Error("Render streaming not available outside Electron");
};

export const appendRenderChunk = async (filePath: string, buffer: ArrayBuffer): Promise<void> => {
  if (isElectron) {
    await window.electronAPI.appendRenderChunk({ filePath, buffer });
    return;
  }

  throw new Error("Render streaming not available outside Electron");
};

export const patchRenderFile = async (params: {
  filePath: string;
  durationMs: number;
  skipPatch?: boolean;
}): Promise<boolean> => {
  if (isElectron) {
    return await window.electronAPI.patchRenderFile(params);
  }

  throw new Error("Render patching not available outside Electron");
};

export const closeRenderStream = async (filePath: string): Promise<boolean> => {
  if (isElectron) {
    return await window.electronAPI.closeRenderStream(filePath);
  }

  throw new Error("Render close not available outside Electron");
};

export const cancelRenderStream = async (filePath: string): Promise<boolean> => {
  if (isElectron) {
    return await window.electronAPI.cancelRenderStream(filePath);
  }

  throw new Error("Render cancel not available outside Electron");
};

export const saveRenderedFile = async (filePath: string, fileName: string): Promise<string | null> => {
  if (isElectron) {
    return await window.electronAPI.saveRenderedFile({ filePath, fileName });
  }

  throw new Error("File saving not available outside Electron");
};

// Native Capture APIs
export const startNativeCapture = async (options: any): Promise<boolean> => {
  // Extract target info - handle both direct targetId and target object
  const target = options?.target ?? {};
  let targetId = options?.targetId || options?.target_id || target?.id || "monitor:0";
  let captureType = options?.captureType || options?.capture_type;
  
  if (!captureType) {
    captureType = target?.type === "window" || targetId.startsWith("window:") ? "window" : "monitor";
  }

  if (isElectron) {
    try {
      return await window.electronAPI.startNativeCapture({
        targetId,
        captureType,
        includeCursor: Boolean(options?.includeCursor),
        frameRate: options?.frameRate ?? 30,
      });
    } catch (error) {
      console.warn("Native capture not available in Electron:", error);
      throw error;
    }
  }

  throw new Error("Native capture not available outside Electron");
};

export const stopNativeCapture = async (): Promise<void> => {
  if (isElectron) {
    try {
      await window.electronAPI.stopNativeCapture();
    } catch (error) {
      console.warn("Failed to stop native capture:", error);
    }
    return;
  }

  throw new Error("Native capture not available outside Electron");
};

export const pollNativeFrame = async (): Promise<any> => {
  if (isElectron) {
    try {
      return await window.electronAPI.pollNativeFrame();
    } catch (error) {
      console.warn("Failed to poll native frame:", error);
      return null;
    }
  }

  throw new Error("Native capture not available outside Electron");
};

// XCap Recording and Screenshot APIs
export const startNativeRecording = async (options: {
  targetId?: string;
  captureType?: string;
  includeCursor?: boolean;
  frameRate?: number;
  fileName?: string;
}): Promise<string> => {
  if (isElectron) {
    try {
      return await window.electronAPI.startNativeRecording({
        targetId: options.targetId || "monitor:0",
        captureType: options.captureType || "monitor",
        includeCursor: Boolean(options.includeCursor ?? true),
        frameRate: options.frameRate ?? 30,
        fileName: options.fileName,
      });
    } catch (error) {
      console.error("Native recording failed for Electron:", error);
      throw error;
    }
  }

  throw new Error("Native recording not available outside Electron");
};

export const stopNativeRecording = async (): Promise<string> => {
  if (isElectron) {
    try {
      return await window.electronAPI.stopNativeRecording();
    } catch (error) {
      console.error("Failed to stop native recording:", error);
      throw error;
    }
  }

  throw new Error("Native recording not available outside Electron");
};

// Native mouse position APIs (synced with Rust screen capture)
export interface NativeMouseEvent {
  timestampMs: number;
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
  buttonState: string; // "none", "left_down", "left_up", "right_down", "right_up", "middle_down", "middle_up"
  isPressed: boolean;
  cursorShape: string; // "default", "pointer", "text", "crosshair", "move", "wait", etc.
}

export interface TranscriptionSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string | null;
}

export interface TranscriptionResult {
  provider: string;
  language?: string | null;
  segments: TranscriptionSegment[];
  raw?: string | null;
}

export interface TranscriptionJobInfo {
  jobId: string;
  provider: string;
  status: string;
}

export interface TranscriptionJobSnapshot {
  jobId: string;
  provider: string;
  status: string;
  errorMessage?: string | null;
  progress?: number | null;
}

export const getRecordingMouseEvents = async (): Promise<NativeMouseEvent[]> => {
  if (isElectron) {
    try {
      return await window.electronAPI.getRecordingMouseEvents();
    } catch (error) {
      console.error("Failed to get recording mouse events:", error);
      return [];
    }
  }
  throw new Error("Native mouse events not available outside Electron");
};

export const clearRecordingMouseEvents = async (): Promise<void> => {
  if (isElectron) {
    try {
      await window.electronAPI.clearRecordingMouseEvents();
    } catch (error) {
      console.error("Failed to clear recording mouse events:", error);
    }
    return;
  }
  throw new Error("Native mouse events not available outside Electron");
};

export const getCurrentMousePosition = async (): Promise<NativeMouseEvent | null> => {
  if (isElectron) {
    try {
      return await window.electronAPI.getCurrentMousePosition();
    } catch (error) {
      console.error("Failed to get current mouse position:", error);
      return null;
    }
  }
  throw new Error("Native mouse position not available outside Electron");
};

export const getBackendInfo = () => {
  return {
    isElectron,
    isTauri,
    isBrowser: !isElectron,
  };
};

// Notes Overlay APIs
export interface NotesShortcutConfig {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export interface NotesOverlayData {
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

export const showNotesOverlay = (): void => {
  if (isElectron) {
    window.electronAPI.showNotesOverlay?.();
  }
};

export const hideNotesOverlay = (): void => {
  if (isElectron) {
    window.electronAPI.hideNotesOverlay?.();
  }
};

export const updateNotesOverlay = (data: NotesOverlayData): void => {
  if (isElectron) {
    window.electronAPI.updateNotesOverlay?.(data);
  }
};

export const destroyNotesOverlay = (): void => {
  if (isElectron) {
    window.electronAPI.destroyNotesOverlay?.();
  }
};

export const startNotesShortcuts = (): void => {
  if (isElectron) {
    window.electronAPI.startNotesShortcuts?.();
  }
};

export const stopNotesShortcuts = (): void => {
  if (isElectron) {
    window.electronAPI.stopNotesShortcuts?.();
  }
};

// Export a single object for easier consumption
export const backendAPI = {
  // Desktop capture
  listDesktopSources,

  // Native capture (streaming)
  startNativeCapture,
  stopNativeCapture,
  pollNativeFrame,

  // Native recording and screenshots
  startNativeRecording,
  stopNativeRecording,

  // Recording assets
  saveRenderedFile,
  saveRecordingAsset,
  readRecordingAsset,
  cleanupRecordingAssets,
  getRecordingAssetUrl,

  // Input capture
  startGlobalInputCapture,
  stopGlobalInputCapture,
  onGlobalInputEvent,

  // Native mouse position (synced with Rust screen capture)
  getRecordingMouseEvents,
  clearRecordingMouseEvents,
  getCurrentMousePosition,

  // Transcription
  listTranscriptionProviders,
  submitTranscription,
  getTranscriptionJob,
  getTranscriptionResult,
  cancelTranscription,

  // Rendering
  startRenderStream,
  appendRenderChunk,
  patchRenderFile,
  closeRenderStream,
  cancelRenderStream,

  // Notes overlay
  showNotesOverlay,
  hideNotesOverlay,
  updateNotesOverlay,
  destroyNotesOverlay,
  startNotesShortcuts,
  stopNotesShortcuts,

  // Utilities
  getBackendInfo,
};

export default backendAPI;
