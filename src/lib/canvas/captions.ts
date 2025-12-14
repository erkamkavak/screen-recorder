import type { CanvasSize } from "../stores";

export type CaptionLikeSegment = {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string | null;
};

const wrapTextLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
};

const findCaptionText = (segments: CaptionLikeSegment[], timeSec: number) => {
  const t = timeSec * 1000;
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (t < s.startMs) continue;
    if (t >= s.startMs && t < s.endMs) return s.text;
    break;
  }
  return null;
};

export const drawCaptionsOverlay = (args: {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  canvasSize: CanvasSize;
  timeSec: number;
  segments: CaptionLikeSegment[];
}) => {
  const { ctx, canvas, canvasSize, timeSec, segments } = args;
  if (!segments.length) return;

  const text = findCaptionText(segments, timeSec);
  if (!text) return;

  const baseHeight = 1080;
  const resolutionScale = canvasSize.height / baseHeight;
  const fontSize = Math.max(14, Math.round(46 * resolutionScale));
  const lineHeight = Math.round(fontSize * 1.2);
  const paddingX = Math.round(48 * resolutionScale);
  const paddingY = Math.round(18 * resolutionScale);
  const maxWidth = Math.max(10, canvas.width - paddingX * 2);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  const lines = wrapTextLines(ctx, text, maxWidth);
  const totalH = lines.length * lineHeight;
  const x = canvas.width / 2;
  const bottom = canvas.height - paddingY;
  const bgTop = bottom - totalH - paddingY;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  const boxW = Math.min(maxWidth, Math.max(10, maxWidth));
  const boxX = (canvas.width - boxW) / 2;
  const boxH = totalH + paddingY;
  const r = Math.round(12 * resolutionScale);
  ctx.beginPath();
  ctx.moveTo(boxX + r, bgTop);
  ctx.arcTo(boxX + boxW, bgTop, boxX + boxW, bgTop + boxH, r);
  ctx.arcTo(boxX + boxW, bgTop + boxH, boxX, bgTop + boxH, r);
  ctx.arcTo(boxX, bgTop + boxH, boxX, bgTop, r);
  ctx.arcTo(boxX, bgTop, boxX + boxW, bgTop, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  for (let i = 0; i < lines.length; i++) {
    const y = bottom - (lines.length - 1 - i) * lineHeight;
    ctx.fillText(lines[i], x, y);
  }

  ctx.restore();
};
