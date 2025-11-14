export const humanDuration = (secondsTotal: number) => {
  if (!isFinite(secondsTotal) || secondsTotal <= 0) return "0s";
  const secs = Math.floor(secondsTotal);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m || h) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
};
 