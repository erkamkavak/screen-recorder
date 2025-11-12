import type { PointerEventRecord } from "../stores";

type MouseOverlayRecorderOptions = {
  width: number;
  height: number;
  fps: number;
  onStream: (stream: MediaStream | null) => void;
};

type PointerState = {
  x: number;
  y: number;
  visible: boolean;
};

export class MouseOverlayRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fps: number;
  private interval: number;
  private lastTime = 0;
  private frameId = 0;
  private pointer: PointerState = { x: 0.5, y: 0.5, visible: false };
  private stream: MediaStream | null = null;
  private running = false;
  private onStream: (stream: MediaStream | null) => void;

  constructor(options: MouseOverlayRecorderOptions) {
    if (typeof document === "undefined") {
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
    this.updateSize(options.width, options.height);
  }

  private draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);

    if (!this.pointer.visible) return;

    const x = Math.max(0, Math.min(1, this.pointer.x)) * width;
    const y = Math.max(0, Math.min(1, this.pointer.y)) * height;
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
      // redraw at new size
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
    };
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
