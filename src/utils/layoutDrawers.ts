import type { DrawFn } from "../stores";
import { HorizAlign, VertAlign, WebcamShape } from "../stores";
import { circleClip, roundedRectClip } from "./drawUtils";
import { calculateWebcamMetrics } from "./webcamMetrics";

export const drawWebcam: DrawFn = (args) => {
  if (!args.webcamState.stream || !args.webcamState.preview) return;

  const { ctx, webcamState, webcamLayoutState, canvasSize } = args;

  const metrics = calculateWebcamMetrics({
    layout: webcamLayoutState,
    containerWidth: canvasSize.width,
    containerHeight: canvasSize.height,
    videoWidth: webcamState.width,
    videoHeight: webcamState.height,
  });

  const borderWidth = webcamLayoutState.borderWidth ?? 0;
  const borderColor = webcamLayoutState.borderColor ?? "#ffffff";
  const shadowBlur = webcamLayoutState.shadowBlur ?? 0;
  const shadowOpacity = webcamLayoutState.shadowOpacity ?? 0;

  const drawWidth = Math.max(metrics.innerWidth, 0);
  const drawHeight = Math.max(metrics.innerHeight, 0);
  const drawX = metrics.left + borderWidth;
  const drawY = metrics.top + borderWidth;

  const applyShadow = () => {
    if (shadowBlur > 0 && shadowOpacity > 0) {
      ctx.shadowColor = `rgba(0,0,0,${shadowOpacity})`;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadowBlur / 2;
    }
  };

  ctx.save();

  if (webcamLayoutState.shape === WebcamShape.circle) {
    const centerX = metrics.left + metrics.width / 2;
    const centerY = metrics.top + metrics.height / 2;
    const outerRadius = metrics.outerRadius;
    const innerRadius = Math.max(metrics.innerRadius, 0);

    const videoAspect = webcamState.height && webcamState.width
      ? webcamState.height / webcamState.width
      : 9 / 16;

    const diameter = innerRadius * 2;
    let videoWidth = diameter;
    let videoHeight = videoWidth * videoAspect;
    if (videoHeight < diameter) {
      videoHeight = diameter;
      videoWidth = videoHeight / videoAspect;
    }

    // Draw border ring (no shadow)
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = borderWidth > 0 ? borderColor : "rgba(0,0,0,0)";
    ctx.fill();

    // Draw video inside clip with shadow
    circleClip(ctx, centerX, centerY, innerRadius, () => {
      applyShadow();
      ctx.drawImage(
        webcamState.preview,
        centerX - videoWidth / 2,
        centerY - videoHeight / 2,
        videoWidth,
        videoHeight
      );
      // Reset shadow after drawing
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  } else {
    const outerRadius = metrics.outerRadius;
    const innerRadius = Math.max(metrics.innerRadius, 0);

    // Border fill (no shadow)
    roundedRectClip(
      ctx,
      metrics.left,
      metrics.top,
      metrics.width,
      metrics.height,
      outerRadius,
      () => {
        if (borderWidth > 0) {
          ctx.fillStyle = borderColor;
          ctx.fillRect(metrics.left, metrics.top, metrics.width, metrics.height);
        }
      }
    );
    
    // Draw video inside inner clip with shadow
    roundedRectClip(ctx, drawX, drawY, drawWidth, drawHeight, innerRadius, () => {
      applyShadow();
      ctx.drawImage(webcamState.preview, drawX, drawY, drawWidth, drawHeight);
      // Reset shadow after drawing
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  }
};

/**
 * Drawing screen share
 */
export const drawScreenShare: DrawFn = (args) => {
  // Screen
  if (args.activeShare && args.activeShare.stream && args.activeShare.preview) {
    const {
      ctx,
      activeShare,
      screenLayoutState,
      canvasSize,
      generalLayoutState,
    } = args;
    const { width, height } = canvasSize;
    const { horizAlign, vertAlign } = screenLayoutState;
    const { padding } = generalLayoutState;
    const m = Math.max(width, height);
    const pad = (padding * Math.min(width, height)) / 4;
    const r = m / 100;

    const displayAspectRatio = activeShare.height / activeShare.width;

    let x0 = 0,
      y0 = 0,
      w = 0,
      h = 0;

    // Landscape mode. Always fills width, so no adjustment on x0. Need to adjust y0.
    if (displayAspectRatio * (width - 2 * pad) <= height - 2 * pad) {
      x0 = pad;
      w = width - 2 * pad;
      h = w * displayAspectRatio;
      if (vertAlign === VertAlign.top) {
        y0 = pad;
      } else if (vertAlign === VertAlign.center) {
        y0 = (height - h) / 2;
      } else if (vertAlign === VertAlign.bottom) {
        y0 = height - pad - h;
      }
    }
    // Portrait mode. Fill height, need to adjust x0.
    else {
      y0 = pad;
      h = height - 2 * pad;
      w = h / displayAspectRatio;
      if (horizAlign === HorizAlign.left) {
        x0 = pad;
      } else if (horizAlign === HorizAlign.center) {
        x0 = (width - w) / 2;
      } else if (horizAlign === HorizAlign.right) {
        x0 = width - pad - w;
      }
    }

    roundedRectClip(ctx, x0, y0, w, h, r, () => {
      ctx.drawImage(activeShare.preview, x0, y0, w, h);
    });
  }
};

/**
 * Draw a simple grid so it's a bit easier to see where we're at.
 */
export const drawHelperGrid: DrawFn = ({ ctx, canvasSize }) => {
  const { width, height } = canvasSize;

  ctx.lineWidth = width / 200;
  ctx.strokeStyle = "white";

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  ctx.restore();
};
