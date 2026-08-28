import { STATUS_ICON, STATUS_LABEL, type MarketStatus } from "@/lib/alignment";

const STYLE: Record<MarketStatus, string> = {
  ALIGNED_LONG: "bg-long/15 text-long border-long/30",
  ALIGNED_SHORT: "bg-long/15 text-long border-long/30",
  DIVERGENCE: "bg-warn/15 text-warn border-warn/30",
  NEUTRAL: "bg-white/5 text-muted border-white/10",
  DATA_UNAVAILABLE: "bg-info/10 text-info border-info/25",
};

export function StatusBadge({ status, size = "md" }: { status: MarketStatus; size?: "md" | "lg" }) {
  const padding = size === "lg" ? "px-4 py-2 text-base" : "px-3 py-1.5 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border font-semibold tracking-wide ${padding} ${STYLE[status]}`}
    >
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
