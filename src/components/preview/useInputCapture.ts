import { get, writable, type Readable, type Writable } from "svelte/store";
import type {
  InputEventRecord,
  KeyEventRecord,
  PointerEventRecord,
} from "../../stores";

type ElectronInputPayload = {
  kind: InputEventRecord["kind"];
  x?: number;
  y?: number;
  button?: number;
  key?: string;
  code?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};

type CreateInputCaptureArgs = {
  isRecording: Readable<boolean>;
  recordingStartTime: Readable<number | null>;
  inputEvents: Writable<InputEventRecord[]>;
};

type PointerKind = PointerEventRecord["kind"];

type ScreenOverlayRef = HTMLDivElement | null;

const POINTER_KINDS: PointerKind[] = [
  "click",
  "pointerdown",
  "pointerup",
  "pointermove",
];

export function createInputCapture({
  isRecording,
  recordingStartTime,
  inputEvents,
}: CreateInputCaptureArgs) {
  const screenFocused = writable(false);

  const pointerListeners = new Set<(record: PointerEventRecord) => void>();

  let screenOverlayEl: ScreenOverlayRef = null;
  let browserListenersAttached = false;
  let unsubscribeElectronEvents: (() => void) | null = null;
  let electronCaptureActive = false;

  const isElectron =
    typeof window !== "undefined" && typeof window.electronAPI !== "undefined";

  const nowSinceStart = () => {
    const start = get(recordingStartTime);
    return start ? performance.now() - start : 0;
  };

  const appendEvent = (record: InputEventRecord) => {
    inputEvents.update((existing) => [...existing, record]);
  };

  const appendPointerRecord = (
    kind: PointerKind,
    pointer: PointerEvent,
    normalize: (coords: { clientX: number; clientY: number }) => {
      x: number;
      y: number;
    }
  ) => {
    if (!POINTER_KINDS.includes(kind)) return;

    const { x, y } = normalize({
      clientX: pointer.clientX,
      clientY: pointer.clientY,
    });
    if (Number.isNaN(x) || Number.isNaN(y)) return;

    if (
      kind === "pointermove" &&
      pointer.movementX === 0 &&
      pointer.movementY === 0
    ) {
      return;
    }

    const record: PointerEventRecord = {
      kind,
      t: nowSinceStart(),
      x,
      y,
      button: pointer.button,
    };

    appendEvent(record);
    pointerListeners.forEach((listener) => listener(record));
  };

  const appendKeyRecord = (kind: KeyEventRecord["kind"], event: KeyboardEvent) => {
    const record: KeyEventRecord = {
      kind,
      t: nowSinceStart(),
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    };
    appendEvent(record);
  };

  const normalizeGlobal = ({ clientX, clientY }: {
    clientX: number;
    clientY: number;
  }) => ({
    x: clientX / window.innerWidth,
    y: clientY / window.innerHeight,
  });

  const normalizeWithinOverlay = ({ clientX, clientY }: {
    clientX: number;
    clientY: number;
  }) => {
    if (!screenOverlayEl) {
      return { x: Number.NaN, y: Number.NaN };
    }
    const rect = screenOverlayEl.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return { x: Number.NaN, y: Number.NaN };
    }
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const handleGlobalPointerEvent = (event: MouseEvent | PointerEvent) => {
    if (!get(isRecording)) return;
    appendPointerRecord(
      (event as PointerEvent).type as PointerKind,
      event as PointerEvent,
      normalizeWithinOverlay
    );
  };

  const handleGlobalKeyEvent = (event: KeyboardEvent) => {
    if (!get(isRecording)) return;
    appendKeyRecord("keydown", event);
  };

  const browserPointerEvents: Array<[string, EventListenerOrEventListenerObject]> = [
    ["click", handleGlobalPointerEvent],
    ["pointerdown", handleGlobalPointerEvent],
    ["pointerup", handleGlobalPointerEvent],
    ["pointermove", handleGlobalPointerEvent],
  ];

  const addBrowserListeners = () => {
    if (browserListenersAttached || typeof window === "undefined") return;
    browserPointerEvents.forEach(([name, handler]) =>
      window.addEventListener(name, handler, true)
    );
    window.addEventListener("keydown", handleGlobalKeyEvent, true);
    browserListenersAttached = true;
  };

  const removeBrowserListeners = () => {
    if (!browserListenersAttached || typeof window === "undefined") return;
    browserPointerEvents.forEach(([name, handler]) =>
      window.removeEventListener(name, handler, true)
    );
    window.removeEventListener("keydown", handleGlobalKeyEvent, true);
    browserListenersAttached = false;
  };

  const appendElectronEvent = (payload: ElectronInputPayload) => {
    const timestamp = nowSinceStart();

    if (payload.kind === "keyup") return;

    if (payload.kind === "keydown") {
      const record: KeyEventRecord = {
        kind: payload.kind,
        t: timestamp,
        key: payload.key ?? payload.code ?? "",
        code: payload.code,
        ctrl: Boolean(payload.ctrl),
        alt: Boolean(payload.alt),
        shift: Boolean(payload.shift),
        meta: Boolean(payload.meta),
      };
      appendEvent(record);
      return;
    }

    if (!POINTER_KINDS.includes(payload.kind as PointerKind)) return;

    if (typeof payload.x !== "number" || typeof payload.y !== "number") return;

    const record: PointerEventRecord = {
      kind: payload.kind as PointerKind,
      t: timestamp,
      x: payload.x,
      y: payload.y,
      button: payload.button,
    };
    appendEvent(record);
  };

  const startElectronCapture = () => {
    if (!isElectron) return;
    if (electronCaptureActive) return;

    window.electronAPI?.startGlobalInputCapture?.();
    electronCaptureActive = true;

    if (!unsubscribeElectronEvents && window.electronAPI?.onGlobalInputEvent) {
      unsubscribeElectronEvents = window.electronAPI.onGlobalInputEvent((event) => {
        appendElectronEvent(event);
      });
    }
  };

  const stopElectronCapture = () => {
    if (!isElectron) return;
    if (!electronCaptureActive) return;

    window.electronAPI?.stopGlobalInputCapture?.();
    electronCaptureActive = false;
    unsubscribeElectronEvents?.();
    unsubscribeElectronEvents = null;
  };

  const recordingUnsub = isRecording.subscribe(($isRecording) => {
    if ($isRecording) {
      if (isElectron && window.electronAPI?.startGlobalInputCapture) {
        startElectronCapture();
      } else {
        addBrowserListeners();
      }
    } else {
      if (isElectron && window.electronAPI?.stopGlobalInputCapture) {
        stopElectronCapture();
      }
      removeBrowserListeners();
      screenFocused.set(false);
    }
  });

  const handleScreenFocus = (event: FocusEvent) => {
    screenFocused.set(true);
    const target = event.currentTarget as HTMLElement | null;
    target?.focus();
  };

  const handleScreenMouseOver = (event: MouseEvent) => {
    screenFocused.set(true);
    const target = event.currentTarget as HTMLElement | null;
    target?.focus();
  };

  const handleScreenMouseLeave = () => {
    screenFocused.set(false);
  };

  const handleLocalPointerEvent = (event: MouseEvent | PointerEvent) => {
    if (!get(isRecording)) return;
    if (!screenOverlayEl) return;

    // In Electron, when global input capture is active (uIOhook), rely on those
    // events as the single source of pointer coordinates to avoid mixing
    // different coordinate systems.
    if (isElectron && electronCaptureActive) return;

    appendPointerRecord(
      (event as PointerEvent).type as PointerKind,
      event as PointerEvent,
      normalizeWithinOverlay
    );
  };

  const attachScreenOverlay = (node: ScreenOverlayRef) => {
    screenOverlayEl = node;
  };

  const destroy = () => {
    recordingUnsub?.();
    removeBrowserListeners();
    stopElectronCapture();
    screenOverlayEl = null;
  };

  const registerPointerListener = (listener: (record: PointerEventRecord) => void) => {
    pointerListeners.add(listener);
    return () => pointerListeners.delete(listener);
  };

  return {
    screenFocused,
    attachScreenOverlay,
    handleScreenFocus,
    handleScreenMouseOver,
    handleScreenMouseLeave,
    handleLocalPointerEvent,
    destroy,
    registerPointerListener,
  };
}
