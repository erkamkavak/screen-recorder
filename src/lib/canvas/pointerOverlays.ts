import type { CanvasSize, PointerEventRecord } from "../stores";

export type PointerPlacement = { x: number; y: number; width: number; height: number };

export const drawClickRipplesOverlay = (args: {
  ctx: CanvasRenderingContext2D;
  placement: PointerPlacement;
  clickRecords: PointerEventRecord[];
  timeSec: number;
  canvasSize: CanvasSize;
  pointerSize: number;
}) => {
  const { ctx, placement, clickRecords, timeSec, canvasSize, pointerSize } = args;
  if (!clickRecords.length) return;

  const timeMs = timeSec * 1000;
  const rippleDurationMs = 200;

  const baseHeight = 1080;
  const resolutionScale = canvasSize.height / baseHeight;
  const POINTER_RENDER_SCALE = 2.5;
  const pointerRenderSize = pointerSize * POINTER_RENDER_SCALE * resolutionScale;

  for (let i = clickRecords.length - 1; i >= 0; i--) {
    const click = clickRecords[i] as any;
    if (typeof click.x !== "number" || typeof click.y !== "number") continue;

    const ageMs = timeMs - click.t;
    if (ageMs < 0) continue;
    if (ageMs > rippleDurationMs) break;

    const progress = ageMs / rippleDurationMs;
    const alpha = Math.max(0, 1 - progress);

    const cx = placement.x + click.x * placement.width;
    const cy = placement.y + click.y * placement.height;

    const radius = pointerRenderSize * (0.2 + progress * 0.3);
    const lineWidth = Math.max(1, 2 * resolutionScale);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = `rgba(250, 128, 114, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(13, 148, 136, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, pointerRenderSize * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
};

export const drawPointerCursorOverlay = (args: {
  ctx: CanvasRenderingContext2D;
  placement: PointerPlacement;
  canvasSize: CanvasSize;
  pointerSize: number;
  pointerState: { visible: boolean; x: number; y: number; isPressed?: boolean; cursorShape?: string | null };
  iconDefault: HTMLImageElement | null;
  iconPressed: HTMLImageElement | null;
}) => {
  const { ctx, placement, canvasSize, pointerSize, pointerState, iconDefault, iconPressed } = args;
  if (!pointerState.visible) return;

  const pointerX = placement.x + pointerState.x * placement.width;
  const pointerY = placement.y + pointerState.y * placement.height;

  const cursorShape = pointerState.cursorShape || "default";
  const usePointerIcon = cursorShape === "pointer" || !!pointerState.isPressed;
  const icon = usePointerIcon ? (iconPressed ?? iconDefault) : iconDefault;

  if (!icon) return;

  const baseHeight = 1080;
  const resolutionScale = canvasSize.height / baseHeight;
  const POINTER_RENDER_SCALE = 2.5;
  const size = pointerSize * POINTER_RENDER_SCALE * resolutionScale;

  const hotspot = usePointerIcon ? { x: 0.5, y: 0.12 } : { x: 0.18, y: 0.2 };
  const drawX = pointerX - size * hotspot.x;
  const drawY = pointerY - size * hotspot.y;

  ctx.drawImage(icon, drawX, drawY, size, size);
};
