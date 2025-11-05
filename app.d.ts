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
