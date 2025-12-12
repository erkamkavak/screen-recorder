type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const roundedRectClip = (
  ctx: Canvas2DContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  cb: () => void
) => {
  ctx.save();

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.clip();

  cb();

  ctx.restore();
};

/**
 * Circle clip
 */
export const circleClip = (
  ctx: Canvas2DContext,
  x: number,
  y: number,
  radius: number,
  cb: () => void
) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.clip();

  cb();

  ctx.restore();
};
