export type ReviewLayoutSizingConfig = {
  minPreviewWidth: number;
  minAsideWidth: number;
  resizeGutter: number;
};

export const clampBetween = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(value, maxValue));

export const computeReviewLayoutSizes = (
  rootWidth: number,
  requestedPreview: number | undefined,
  config: ReviewLayoutSizingConfig
) => {
  const safeRootWidth = Math.max(rootWidth, 0);
  const minTotal = config.minPreviewWidth + config.minAsideWidth + config.resizeGutter;

  if (safeRootWidth <= minTotal) {
    const available = Math.max(safeRootWidth - config.resizeGutter, 0);
    const previewRatio = config.minPreviewWidth / (config.minPreviewWidth + config.minAsideWidth);
    const preview = available * previewRatio;
    const aside = available - preview;
    return {
      previewWidthPx: Math.max(preview, 0),
      asideWidthPx: Math.max(aside, 0),
    };
  }

  const suggestedPreview = requestedPreview ?? Math.max(config.minPreviewWidth, safeRootWidth * 0.7);
  const maxPreview = Math.max(safeRootWidth - config.minAsideWidth - config.resizeGutter, config.minPreviewWidth);
  const preview = clampBetween(suggestedPreview, config.minPreviewWidth, maxPreview);
  const maxAsideWidth = Math.max(safeRootWidth - config.minPreviewWidth - config.resizeGutter, config.minAsideWidth);
  const aside = clampBetween(safeRootWidth - preview - config.resizeGutter, config.minAsideWidth, maxAsideWidth);

  return { previewWidthPx: preview, asideWidthPx: aside };
};
