import type { WebcamLayoutState } from "../stores";

export type WebcamMetrics = {
  width: number;
  height: number;
  left: number;
  top: number;
  padding: number;
  availableWidth: number;
  availableHeight: number;
  innerWidth: number;
  innerHeight: number;
  outerRadius: number;
  innerRadius: number;
};

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export function calculateWebcamMetrics({
  layout,
  containerWidth,
  containerHeight,
  videoWidth,
  videoHeight,
}: {
  layout: WebcamLayoutState;
  containerWidth: number;
  containerHeight: number;
  videoWidth?: number;
  videoHeight?: number;
}): WebcamMetrics {
  const aspect = videoWidth && videoHeight && videoWidth > 0
    ? videoHeight / videoWidth
    : 9 / 16;

  const size = layout.size ?? 0.35;
  const minDimension = Math.min(containerWidth, containerHeight);

  let width = 0;
  let height = 0;

  if (layout.shape === "circle") {
    const diameter = minDimension * size;
    width = diameter;
    height = diameter;
  } else {
    const tentativeWidth = containerWidth * size;
    const tentativeHeight = tentativeWidth * aspect;

    if (tentativeHeight > containerHeight * 0.8) {
      height = containerHeight * size;
      width = height / aspect;
    } else {
      width = tentativeWidth;
      height = tentativeHeight;
    }
  }

  const padding = Math.min(layout.padding ?? 0, 0.25) * minDimension;
  const borderWidth = layout.borderWidth ?? 0;

  const availableWidth = Math.max(containerWidth - 2 * padding - width, 0);
  const availableHeight = Math.max(containerHeight - 2 * padding - height, 0);

  const offsetX = clamp01(layout.offsetX ?? 0.5);
  const offsetY = clamp01(layout.offsetY ?? 0.5);

  const left = padding + availableWidth * offsetX;
  const top = padding + availableHeight * offsetY;

  const innerWidth = Math.max(width - borderWidth * 2, 0);
  const innerHeight = Math.max(height - borderWidth * 2, 0);

  const outerRadius =
    layout.shape === "circle"
      ? width / 2
      : (Math.min(Math.max((layout.borderRadius ?? 0) / 5, 0), 1) * Math.min(width, height)) / 2;

  const innerRadius = Math.max(outerRadius - borderWidth, 0);

  return {
    width,
    height,
    left,
    top,
    padding,
    availableWidth,
    availableHeight,
    innerWidth,
    innerHeight,
    outerRadius,
    innerRadius,
  };
}
