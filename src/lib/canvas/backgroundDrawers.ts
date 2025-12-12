import type { DrawFn, Theme } from "../stores";
import { roundedRectClip } from "./drawUtils";

const bucketFrequencies = (freqs: Uint8Array, bucketSize: number): number[] => {
  const result: number[] = [];
  if (!freqs.length) return result;
  const size = Math.max(1, Math.floor(bucketSize));
  let acc = 0;
  let count = 0;

  for (let i = 0; i < freqs.length; i += 1) {
    acc += freqs[i];
    count += 1;
    if (count === size) {
      result.push(acc / size);
      acc = 0;
      count = 0;
    }
  }

  if (count > 0) {
    result.push(acc / count);
  }

  return result;
};

/**
 * Solid background
 */
export const createSolidBackground = (key: keyof Theme): DrawFn => {
  return ({ ctx, theme, canvasSize }) => {
    ctx.save();

    ctx.fillStyle = theme[key];
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    ctx.restore();
  };
};

/**
 * Gradient background
 */
export const createLinearGradientBackground = (
  direction: "bottom_right" | "top" | "bottom" | "left" | "right"
): DrawFn => {
  return ({ ctx, canvasSize, theme }) => {
    ctx.save();

    let gradVals = [0, 0, canvasSize.width, canvasSize.height] as [
      number,
      number,
      number,
      number
    ];
    switch (direction) {
      case "top":
        gradVals = [0, canvasSize.height, 0, 0];
        break;
      case "bottom":
        gradVals = [0, 0, 0, canvasSize.height];
        break;
      case "bottom_right":
        gradVals = [0, 0, canvasSize.width, canvasSize.height];
        break;
      case "left":
        gradVals = [canvasSize.width, 0, 0, 0];
        break;
      case "right":
        gradVals = [0, 0, canvasSize.width, 0];
        break;
    }

    const lingrad = ctx.createLinearGradient(...gradVals);
    lingrad.addColorStop(0, theme.secondary);
    lingrad.addColorStop(1, theme.primary);

    ctx.fillStyle = lingrad;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    ctx.restore();
  };
};

/**
 * Audio wave background
 */
export const createAudioWaveBackground = (): DrawFn => {
  return ({ ctx, micAnalyzer, theme, canvasSize }) => {
    ctx.save();
    const { width, height } = canvasSize;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, theme.secondary);
    bgGrad.addColorStop(1, theme.primary);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const lingrad = ctx.createLinearGradient(0, -height / 4, 0, height);
    lingrad.addColorStop(0, theme.secondary);
    lingrad.addColorStop(1, theme.primary);

    if (micAnalyzer) {
      const { freqs, analyser } = micAnalyzer;
      analyser.getByteFrequencyData(freqs);

      const buckets = bucketFrequencies(freqs, 16);
      if (buckets.length > 1) {
        const dx = width / buckets.length;
        const p = new Path2D();

        let prev: [number, number] | null = null;
        for (let i = 0; i < buckets.length; i += 1) {
          const point: [number, number] = [i * dx, (1 - buckets[i] / 255) * height];

          if (!prev) {
            p.moveTo(point[0], point[1]);
            prev = point;
            continue;
          }

          const xMid = (prev[0] + point[0]) / 2;
          const yMid = (prev[1] + point[1]) / 2;
          const cpX1 = (xMid + prev[0]) / 2;
          const cpX2 = (xMid + point[0]) / 2;

          p.quadraticCurveTo(cpX1, prev[1], xMid, yMid);
          p.quadraticCurveTo(cpX2, point[1], point[0], point[1]);
          prev = point;
        }

        p.lineTo(width, height);
        p.lineTo(0, height);
        p.closePath();

        ctx.fillStyle = lingrad;
        ctx.fill(p);
      }
    }

    ctx.restore();
  };
};

/**
 * Audio bar background
 */
export const createAudioBarBackground = ({ N }: { N: number }): DrawFn => {
  return ({ ctx, canvasSize, theme, micAnalyzer }) => {
    ctx.save();
    const { width, height } = canvasSize;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, theme.secondary);
    bgGrad.addColorStop(1, theme.primary);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const lingrad = ctx.createLinearGradient(0, -height / 3, 0, height);
    lingrad.addColorStop(0, theme.secondary);
    lingrad.addColorStop(1, theme.primary);

    if (micAnalyzer) {
      const { freqs, analyser } = micAnalyzer;
      analyser.getByteFrequencyData(freqs);

      const buckets = bucketFrequencies(freqs, N);
      if (!buckets.length) {
        ctx.restore();
        return;
      }

      const gap = width / 100;
      const barWidth = (width - (buckets.length + 1) * gap) / buckets.length;

      ctx.fillStyle = lingrad;
      for (let i = 0; i < buckets.length; i += 1) {
        const x = gap + (barWidth + gap) * i;
        const h = (buckets[i] / 255) * height;
        const y = height - h;
        ctx.fillRect(x, y, barWidth, h);
      }
    }

    ctx.restore();
  };
};

/**
 * Rainbow bars
 */
export const createRainbowAudioBarBackground = ({
  N = 1,
  gapPercent = 0.005,
  initHue = 0,
}: {
  N?: number;
  gapPercent?: number;
  initHue?: number;
} = {}): DrawFn => {
  return ({ ctx, canvasSize, theme, micAnalyzer }) => {
    ctx.save();
    const { width, height } = canvasSize;

    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, theme.secondary);
    bgGradient.addColorStop(1, theme.primary);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    if (micAnalyzer) {
      const { freqs, analyser } = micAnalyzer;
      analyser.getByteFrequencyData(freqs);

      const buckets = bucketFrequencies(freqs, N);
      if (!buckets.length) {
        ctx.restore();
        return;
      }

      const gap = gapPercent * width;
      const barWidth = (width - (buckets.length + 1) * gap) / buckets.length;
      const barHeight = barWidth / 2;
      const numFullBars = Math.floor(height / (barHeight + gap));

      for (let i = 0; i < buckets.length; i++) {
        const x0 = gap + (barWidth + gap) * i;
        const h = (buckets[i] / 255) * height;
        const ang = (initHue + (i / buckets.length) * 360) % 360;

        const numFilledBars = Math.floor(h / (barHeight + gap));
        const lastBarHeight = height - 2 * gap - numFullBars * (barHeight + gap);

        for (let j = 0; j < numFullBars; j++) {
          ctx.fillStyle = `hsla(${ang}, ${j < numFilledBars ? 70 : 30}%, 40%, ${
            j < numFilledBars ? 1 : 0.6
          })`;

          roundedRectClip(
            ctx,
            x0,
            height - (j + 1) * (barHeight + gap),
            barWidth,
            barHeight,
            gap,
            () => {
              ctx.fillRect(
                x0,
                height - (j + 1) * (barHeight + gap),
                barWidth,
                barHeight
              );
            }
          );
        }
        ctx.fillStyle = `hsla(${ang}, 30%, 40%, 0.6)`;
        roundedRectClip(ctx, x0, gap, barWidth, lastBarHeight, gap, () => {
          ctx.fillRect(x0, gap, barWidth, lastBarHeight);
        });
      }
    }

    ctx.restore();
  };
};
