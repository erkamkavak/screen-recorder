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
  fontSize?: number;
  color?: string;
}) => {
  const { ctx, canvas, canvasSize, timeSec, segments, fontSize: customFontSize, color } = args;
  if (!segments.length) return;

  const text = findCaptionText(segments, timeSec);
  if (!text) return;

  const baseHeight = 1080;
  const resolutionScale = canvasSize.height / baseHeight;
  const fontSize = customFontSize ? Math.round(customFontSize * resolutionScale) : Math.max(14, Math.round(46 * resolutionScale));
  const lineHeight = Math.round(fontSize * 1.3);
  
  // Safe area padding from edges
  const edgePaddingX = Math.round(64 * resolutionScale);
  const edgePaddingY = Math.round(48 * resolutionScale);
  
  // Internal padding for the text box
  const internalPaddingX = Math.round(24 * resolutionScale);
  const internalPaddingY = Math.round(12 * resolutionScale);

  const maxWidth = Math.max(10, canvas.width - edgePaddingX * 2);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  const lines = wrapTextLines(ctx, text, maxWidth);
  if (!lines.length) {
    ctx.restore();
    return;
  }

  const lineWidths = lines.map(l => ctx.measureText(l).width);
  const maxLineWidth = Math.max(...lineWidths);
  
  const totalTextH = lines.length * lineHeight;
  const boxW = maxLineWidth + internalPaddingX * 2;
  const boxH = totalTextH + internalPaddingY * 2;
  
  const x = canvas.width / 2;
  const bottom = canvas.height - edgePaddingY;
  const boxY = bottom - boxH;
  const boxX = (canvas.width - boxW) / 2;

  // Draw background shadow/glow for readability
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = Math.round(8 * resolutionScale);
  ctx.shadowOffsetY = Math.round(2 * resolutionScale);

  // Draw tight background box
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  const r = Math.round(10 * resolutionScale);
  
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, r);
  ctx.fill();

  // Reset shadow for text
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  
  // Draw subtle text shadow for better contrast
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = Math.round(4 * resolutionScale);

  ctx.fillStyle = color || "rgba(255, 255, 255, 0.98)";
  
  const startY = boxY + internalPaddingY + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    const lineY = startY + i * lineHeight;
    ctx.fillText(lines[i], x, lineY);
  }

  ctx.restore();
};
