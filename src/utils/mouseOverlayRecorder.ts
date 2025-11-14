import type { PointerEventRecord } from "../stores";
import cursorPackCursor from "../assets/cursors/cutecore-pink-cursor.png?url";
import cursorPackPointer from "../assets/cursors/cutecore-pink-pointer.png?url";

type MouseOverlayRecorderOptions = {
  width: number;
  height: number;
  fps: number;
  onStream: (stream: MediaStream | null) => void;
  pointerIconUrl?: string;
  pointerPressedIconUrl?: string;
};

type PointerState = {
  x: number;
  y: number;
  visible: boolean;
  kind: PointerEventRecord["kind"];
  button?: number;
};

const DEFAULT_ICON_URL = cursorPackCursor;
const DEFAULT_PRESSED_ICON_URL = cursorPackPointer;
const POINTER_IDLE_TIMEOUT = 1500; // ms

export class MouseOverlayRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fps: number;
  private interval: number;
  private lastTime = 0;
  private frameId = 0;
  private pointer: PointerState = { x: 0.5, y: 0.5, visible: false, kind: "pointermove" };
  private stream: MediaStream | null = null;
  private running = false;
  private onStream: (stream: MediaStream | null) => void;
  private pointerPressed = false;
  private lastEventTimestamp = 0;
  private havePointer = false;
  private pointerIcon: HTMLImageElement | null = null;
  private pointerPressedIcon: HTMLImageElement | null = null;

  constructor(options: MouseOverlayRecorderOptions) {
    if (typeof document === "undefined" || typeof window === "undefined") {
      throw new Error("Mouse overlay recorder requires a browser environment");
    }

    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Mouse overlay canvas context unavailable");
    }

    this.ctx = ctx;
    this.fps = options.fps;
    this.interval = 1000 / this.fps;
    this.onStream = options.onStream;
    this.loadPointerIcon(options.pointerIconUrl ?? DEFAULT_ICON_URL, (img) => {
      this.pointerIcon = img;
    });
    this.loadPointerIcon(options.pointerPressedIconUrl ?? DEFAULT_PRESSED_ICON_URL, (img) => {
      this.pointerPressedIcon = img;
    });
    this.updateSize(options.width, options.height);
  }

  private loadPointerIcon(src: string, callback: (image: HTMLImageElement) => void) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => callback(img);
    img.onerror = () => callback(img);
    img.src = src;
  }

  private draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);

    if (!this.havePointer) return;
    const elapsed = performance.now() - this.lastEventTimestamp;
    if (elapsed > POINTER_IDLE_TIMEOUT) return;
    if (!this.pointer.visible) return;

    const x = Math.max(0, Math.min(1, this.pointer.x)) * width;
    const y = Math.max(0, Math.min(1, this.pointer.y)) * height;

    const icon =
      this.pointerPressed && this.pointerPressedIcon
        ? this.pointerPressedIcon
        : this.pointerIcon;

    if (icon && icon.complete && icon.naturalWidth && icon.naturalHeight) {
      const size = Math.max(12, Math.min(width, height) * 0.035);
      ctx.drawImage(icon, x - size / 2, y - size / 2, size, size);
      return;
    }

    const radius = Math.max(4, Math.min(width, height) * 0.015);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
    ctx.stroke();
    ctx.restore();
  }

  private loop = () => {
    if (!this.running) return;

    const now = performance.now();
    const elapsed = now - this.lastTime;
    if (elapsed > this.interval) {
      this.lastTime = now - (elapsed % this.interval);
      this.draw();
    }

    this.frameId = requestAnimationFrame(this.loop);
  };

  updateSize(width: number, height: number) {
    if (width && height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.draw();
    }
  }

  updateFps(fps: number) {
    if (fps > 0) {
      this.fps = fps;
      this.interval = 1000 / fps;
    }
  }

  updatePointer(record: PointerEventRecord) {
    if (
      typeof record.x !== "number" ||
      typeof record.y !== "number" ||
      Number.isNaN(record.x) ||
      Number.isNaN(record.y)
    ) {
      return;
    }

    this.pointer = {
      x: record.x,
      y: record.y,
      visible: true,
      kind: record.kind,
      button: record.button,
    };
    this.lastEventTimestamp = performance.now();
    this.havePointer = true;

    if (record.kind === "pointerdown") {
      this.pointerPressed = true;
    } else if (record.kind === "pointerup") {
      this.pointerPressed = false;
    } else if (record.kind === "click") {
      this.pointerPressed = true;
      setTimeout(() => {
        this.pointerPressed = false;
      }, 150);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.stream = this.canvas.captureStream(this.fps);
    this.onStream(this.stream);
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.onStream(null);
  }

  destroy() {
    this.stop();
  }

  getStream() {
    return this.stream;
  }
}
