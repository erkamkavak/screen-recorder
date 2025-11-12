export {};

declare global {
  interface DesktopCaptureSourceSummary {
    id: string;
    name: string;
    thumbnail: string | null;
  }

  interface DesktopCaptureOptions {
    types?: Array<"screen" | "window" | string>;
    thumbnailSize?: {
      width: number;
      height: number;
    };
    preferredId?: string;
  }

  interface ElectronAPI {
    listDesktopSources?: (options?: DesktopCaptureOptions) => Promise<
      DesktopCaptureSourceSummary[]
    >;
    getDesktopSourceId?: (options?: DesktopCaptureOptions) => Promise<string | null>;
    startGlobalInputCapture?: () => void;
    stopGlobalInputCapture?: () => void;
    onGlobalInputEvent?: (listener: (event: any) => void) => () => void;
    saveRecordingAsset?: (payload: {
      fileName: string;
      buffer: ArrayBuffer;
    }) => Promise<string>;
    cleanupRecordingAssets?: (paths: string[]) => Promise<void>;
    readRecordingAsset?: (path: string) => Promise<ArrayBuffer>;
    getRecordingAssetUrl?: (path: string) => Promise<string>;
    startRenderStream?: (fileName: string) => Promise<string>;
    appendRenderChunk?: (payload: { filePath: string; buffer: ArrayBuffer }) => Promise<void>;
    patchRenderFile?: (payload: { filePath: string; durationMs: number }) => Promise<boolean>;
    cancelRenderStream?: (filePath: string) => Promise<boolean>;
    saveRenderedFile?: (payload: { filePath: string; fileName: string }) => Promise<string | null>;
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
