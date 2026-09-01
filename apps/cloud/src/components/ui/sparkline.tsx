/**
 * Minimal inline SVG sparkline. Renders real data points (zeros included) — it
 * is never fed synthetic values. Renders nothing meaningful for an all-zero
 * series except a flat baseline, which is the honest picture of "no signups".
 */
export function Sparkline({
  points,
  width = 320,
  height = 48,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div className="text-xs text-[var(--color-faint)]" style={{ width, height }}>
        No data
      </div>
    );
  }
  const max = Math.max(1, ...points);
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (v / max) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Trend sparkline"
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
