/**
 * Retail と Large Trader の方向が一致しているかを判定するロジック。
 *
 * ここで出す数値は「売買シグナル」ではなく、
 * 「どちら側にポジションが傾いているか」の可視化である。
 */

import type { Bias, LargeTraderPosition, RetailSentiment, Trend } from "@/providers/types";

/** Retail: Long% がこの値以上なら LONG 寄りとみなす */
export const RETAIL_BIAS_THRESHOLD = 55;
/** Large Trader: Net が総建玉のこの割合 (%) を超えたら方向ありとみなす */
export const LARGE_BIAS_THRESHOLD = 5;
/** 前週比 Net の変化がこの割合 (%) を超えたら増減あり (↑ / ↓) とみなす */
export const LARGE_MOMENTUM_THRESHOLD = 3;

export type MarketStatus =
  | "ALIGNED_LONG"
  | "ALIGNED_SHORT"
  | "DIVERGENCE"
  | "NEUTRAL"
  | "DATA_UNAVAILABLE";

export interface AlignmentInput {
  retail: RetailSentiment | null;
  large: LargeTraderPosition | null;
  priceTrend: Trend | null;
}

export interface AlignmentResult {
  retailBias: Bias | null;
  largeBias: Bias | null;
  /** Large Trader の Net が前週比で増えているか (LONG ↑ / SHORT ↓ の矢印用) */
  largeMomentum: Trend | null;
  /** 前週比の Net 変化率 (%)。前週データがなければ null */
  largeNetChangePercent: number | null;
  priceTrend: Trend | null;
  status: MarketStatus;
  /** 0-100。100 に近いほど Retail と Large が同じ方向を向いている */
  score: number | null;
}

export function retailBias(retail: RetailSentiment): Bias {
  if (retail.longPercent >= RETAIL_BIAS_THRESHOLD) return "LONG";
  if (retail.longPercent <= 100 - RETAIL_BIAS_THRESHOLD) return "SHORT";
  return "NEUTRAL";
}

/** Net が総建玉に占める割合 (%)。LONG 側が多ければプラス。 */
export function netPercent(large: LargeTraderPosition): number {
  const gross = large.longPosition + large.shortPosition;
  if (gross <= 0) return 0;
  return (large.netPosition / gross) * 100;
}

export function largeBias(large: LargeTraderPosition): Bias {
  const pct = netPercent(large);
  if (pct >= LARGE_BIAS_THRESHOLD) return "LONG";
  if (pct <= -LARGE_BIAS_THRESHOLD) return "SHORT";
  return "NEUTRAL";
}

/** 前週比の Net 変化率 (%)。前週 Net が 0 / 不明なら null。 */
export function largeNetChangePercent(large: LargeTraderPosition): number | null {
  const prev = large.previousNetPosition;
  if (prev === null || prev === 0) return null;
  return ((large.netPosition - prev) / Math.abs(prev)) * 100;
}

/** Net が「積み増されているか / 減らされているか」。方向ではなく増減を表す。 */
export function largeMomentum(large: LargeTraderPosition): Trend | null {
  const change = largeNetChangePercent(large);
  if (change === null) return null;
  if (change > LARGE_MOMENTUM_THRESHOLD) return "UP";
  if (change < -LARGE_MOMENTUM_THRESHOLD) return "DOWN";
  return "FLAT";
}

function statusOf(retail: Bias, large: Bias): MarketStatus {
  if (retail === "NEUTRAL" || large === "NEUTRAL") return "NEUTRAL";
  if (retail === large) return retail === "LONG" ? "ALIGNED_LONG" : "ALIGNED_SHORT";
  return "DIVERGENCE";
}

/**
 * Alignment Score (0-100)。
 *
 *   50            … 判断材料が弱い / 中立
 *   50 + (15〜25) … Retail と Large が同方向 (確信度で加点)
 *   50 - (15〜25) … Retail と Large が逆方向
 *   ± 7           … Large の建玉が方向を強めているか (前週比)
 *   ± 5           … 価格トレンドが Large の方向と一致しているか
 *
 * 意図的に 0 / 100 には振り切らない。売買シグナルではなく、
 * 「傾きの強さ」を表す指標であることを数値の見た目でも保つため。
 */
export function alignmentScore(input: {
  retail: RetailSentiment;
  large: LargeTraderPosition;
  priceTrend: Trend | null;
}): number {
  const rBias = retailBias(input.retail);
  const lBias = largeBias(input.large);
  const status = statusOf(rBias, lBias);

  const sign = status === "ALIGNED_LONG" || status === "ALIGNED_SHORT" ? 1 : status === "DIVERGENCE" ? -1 : 0;

  // Retail / Large それぞれの傾きの強さ (0-1)
  const retailConviction = clamp01(Math.abs(input.retail.longPercent - 50) / 25);
  const largeConviction = clamp01(Math.abs(netPercent(input.large)) / 30);
  const conviction = (retailConviction + largeConviction) / 2;

  let score = 50 + sign * (15 + 10 * conviction);

  // 大口が方向を積み増しているか (Net の絶対値が増えていれば方向を強めている)
  const change = largeNetChangePercent(input.large);
  if (sign !== 0 && change !== null && lBias !== "NEUTRAL") {
    const strengthening = lBias === "LONG" ? change > 0 : change < 0;
    const magnitude = clamp01(Math.abs(change) / 25);
    score += sign * (strengthening ? 1 : -1) * 7 * magnitude;
  }

  // 価格トレンドが大口の方向と一致しているか
  if (sign !== 0 && input.priceTrend && input.priceTrend !== "FLAT" && lBias !== "NEUTRAL") {
    const priceMatchesLarge =
      (input.priceTrend === "UP" && lBias === "LONG") || (input.priceTrend === "DOWN" && lBias === "SHORT");
    score += sign * (priceMatchesLarge ? 1 : -1) * 5;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

export function evaluateAlignment(input: AlignmentInput): AlignmentResult {
  const { retail, large, priceTrend } = input;

  if (!retail || !large) {
    return {
      retailBias: retail ? retailBias(retail) : null,
      largeBias: large ? largeBias(large) : null,
      largeMomentum: large ? largeMomentum(large) : null,
      largeNetChangePercent: large ? largeNetChangePercent(large) : null,
      priceTrend: priceTrend ?? null,
      status: "DATA_UNAVAILABLE",
      score: null,
    };
  }

  const rBias = retailBias(retail);
  const lBias = largeBias(large);

  return {
    retailBias: rBias,
    largeBias: lBias,
    largeMomentum: largeMomentum(large),
    largeNetChangePercent: largeNetChangePercent(large),
    priceTrend: priceTrend ?? null,
    status: statusOf(rBias, lBias),
    score: alignmentScore({ retail, large, priceTrend: priceTrend ?? null }),
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export const STATUS_LABEL: Record<MarketStatus, string> = {
  ALIGNED_LONG: "ALIGNED LONG",
  ALIGNED_SHORT: "ALIGNED SHORT",
  DIVERGENCE: "DIVERGENCE",
  NEUTRAL: "NEUTRAL",
  DATA_UNAVAILABLE: "DATA UNAVAILABLE",
};

export const STATUS_ICON: Record<MarketStatus, string> = {
  ALIGNED_LONG: "🟢",
  ALIGNED_SHORT: "🟢",
  DIVERGENCE: "⚠️",
  NEUTRAL: "⚪",
  DATA_UNAVAILABLE: "🔵",
};
