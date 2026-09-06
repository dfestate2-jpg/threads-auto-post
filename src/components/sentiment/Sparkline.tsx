import type { SeriesPoint } from "@/providers/types";

/** 依存ライブラリなしの折れ線。細かいテクニカル分析はしない、形が分かれば十分。 */
export function Sparkline({
  points,
  color,
  height = 96,
  baseline,
}: {
  points: SeriesPoint[];
  color: string;
  height?: number;
  /** 基準線を引く値 (Retail なら 50%) */
  baseline?: number;
}) {
  if (points.length < 2) {
    return <p className="text-xs text-muted">チャートを描くだけの履歴がありません</p>;
  }

  const width = 320;
  const values = points.map((p) => p.v);
  const candidates = baseline === undefined ? values : [...values, baseline];
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || 1;
  const pad = span * 0.12;
  const lo = min - pad;
  const hi = max + pad;

  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `grad-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-24 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="履歴チャート"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline !== undefined && baseline >= lo && baseline <= hi ? (
        <line
          x1="0"
          x2={width}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="#2b3340"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      ) : null}
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
