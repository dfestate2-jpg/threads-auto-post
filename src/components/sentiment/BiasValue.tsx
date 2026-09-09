import type { Bias, Trend } from "@/providers/types";

const COLOR: Record<Bias, string> = {
  LONG: "text-long",
  SHORT: "text-short",
  NEUTRAL: "text-muted",
};

/**
 * Large Trader の方向表示。
 * 方向 (LONG / SHORT) に加えて、建玉が積み増されているか (↑ / ↓) を出す。
 */
export function BiasValue({
  bias,
  momentum,
  size = "md",
}: {
  bias: Bias;
  momentum?: Trend | null;
  size?: "md" | "lg";
}) {
  // 方向が定まっていないときに矢印だけ出しても読み取れないので、NEUTRAL では出さない
  const arrow = bias === "NEUTRAL" ? null : momentum === "UP" ? "↑" : momentum === "DOWN" ? "↓" : null;
  return (
    <span className={`font-num font-bold tracking-tight ${COLOR[bias]} ${size === "lg" ? "text-3xl" : "text-xl"}`}>
      {bias}
      {arrow ? <span className="ml-1">{arrow}</span> : null}
    </span>
  );
}
