import type { SeriesPoint } from "@/providers/types";

/** Large Trader の Net Position を週次の棒で表示する (0 を挟んで上下に伸ばす) */
export function NetPositionChart({ points }: { points: SeriesPoint[] }) {
  if (points.length === 0) {
    return <p className="text-xs text-muted">履歴がありません</p>;
  }

  const width = 320;
  const height = 96;
  const maxAbs = Math.max(...points.map((p) => Math.abs(p.v))) || 1;
  const zeroY = height / 2;
  const slot = width / points.length;
  const barWidth = Math.max(1.5, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" role="img" aria-label="Net Position 履歴">
      <line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="#2b3340" strokeWidth="1" />
      {points.map((p, i) => {
        const h = (Math.abs(p.v) / maxAbs) * (height / 2 - 4);
        const x = i * slot + (slot - barWidth) / 2;
        const y = p.v >= 0 ? zeroY - h : zeroY;
        return (
          <rect
            key={p.t}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(1, h)}
            fill={p.v >= 0 ? "#2fbf71" : "#e0533d"}
            opacity={i === points.length - 1 ? 1 : 0.55}
            rx="1"
          />
        );
      })}
    </svg>
  );
}
