/**
 * 各銘柄の表示に必要なデータを Provider から集めて 1 つにまとめる層。
 *
 * ここでの原則:
 *   - 取れなかったものは null のまま返す (埋めない)
 *   - DEMO データかどうかを必ず持ち回る
 *   - Retail Provider が複数あるときだけ Aggregated として扱う
 */

import { evaluateAlignment, type AlignmentResult } from "@/lib/alignment";
import { enabledMarkets, findMarket, type Market } from "@/lib/markets";
import {
  dataMode,
  largeTraderProviders,
  priceProviders,
  retailProviders,
  type DataMode,
} from "@/providers/registry";
import type {
  LargeTraderPosition,
  MarketPrice,
  ProviderResult,
  RetailSentiment,
  Trend,
} from "@/providers/types";

/** 価格トレンドとみなす 24 時間変化率のしきい値 (%) */
export const PRICE_TREND_THRESHOLD = 0.1;

export interface MarketSnapshot {
  market: Market;
  retail: RetailSentiment | null;
  /** 「OANDA Retail Sentiment」「Aggregated Retail Sentiment」など、出所を誤解させない表示名 */
  retailLabel: string;
  retailSources: string[];
  retailReason: string | null;
  large: LargeTraderPosition | null;
  largeReason: string | null;
  price: MarketPrice | null;
  priceReason: string | null;
  alignment: AlignmentResult;
  /** 1 つでも DEMO データを含むか */
  demo: boolean;
}

export function priceTrendOf(price: MarketPrice | null): Trend | null {
  if (!price || price.change24hPercent === null) return null;
  if (price.change24hPercent > PRICE_TREND_THRESHOLD) return "UP";
  if (price.change24hPercent < -PRICE_TREND_THRESHOLD) return "DOWN";
  return "FLAT";
}

/**
 * 複数の Retail Provider を 1 つにまとめる。
 * 1 社だけなら「その会社の顧客ポジション」であって市場全体ではないので、
 * ラベルにも提供元名をそのまま残す。
 */
export function aggregateRetail(
  results: ProviderResult<RetailSentiment>[],
): { data: RetailSentiment | null; label: string; sources: string[]; reason: string | null } {
  const ok = results.filter((r): r is { status: "ok"; data: RetailSentiment } => r.status === "ok");

  if (ok.length === 0) {
    const reasons = results
      .filter((r): r is { status: "unavailable"; source: string; reason: string } => r.status === "unavailable")
      .map((r) => `${r.source}: ${r.reason}`);
    return {
      data: null,
      label: "Retail Sentiment",
      sources: [],
      reason: reasons.length > 0 ? reasons.join(" / ") : "Retail Provider が設定されていない",
    };
  }

  const sources = ok.map((r) => r.data.meta.source);
  // 履歴と変化量は代表 1 社 (最初に取得できた Provider) のものを使う
  const primary = ok[0].data;
  const longPercent = Math.round(ok.reduce((sum, r) => sum + r.data.longPercent, 0) / ok.length);
  const newest = ok.reduce((a, b) => (a.data.meta.updatedAt > b.data.meta.updatedAt ? a : b)).data;

  const label =
    ok.length > 1 ? `Aggregated Retail Sentiment (${sources.join(" + ")})` : `${sources[0]} Retail Sentiment`;

  return {
    data: {
      longPercent,
      shortPercent: 100 - longPercent,
      change1h: primary.change1h,
      change24h: primary.change24h,
      history: primary.history,
      meta: {
        source: sources.join(" + "),
        updatedAt: newest.meta.updatedAt,
        cadence: primary.meta.cadence,
        demo: ok.some((r) => r.data.meta.demo),
      },
    },
    label,
    sources,
    reason: null,
  };
}

function firstOk<T>(results: ProviderResult<T>[]): { data: T | null; reason: string | null } {
  const ok = results.find((r): r is { status: "ok"; data: T } => r.status === "ok");
  if (ok) return { data: ok.data, reason: null };
  const reasons = results
    .filter((r): r is { status: "unavailable"; source: string; reason: string } => r.status === "unavailable")
    .map((r) => `${r.source}: ${r.reason}`);
  return { data: null, reason: reasons.length > 0 ? reasons.join(" / ") : "Provider が設定されていない" };
}

export async function getMarketSnapshot(
  market: Market,
  mode: DataMode = dataMode(),
): Promise<MarketSnapshot> {
  const [retailResults, largeResults, priceResults] = await Promise.all([
    Promise.all(retailProviders(mode).map((p) => p.getRetailSentiment(market))),
    Promise.all(largeTraderProviders(mode).map((p) => p.getLargeTraderPosition(market))),
    Promise.all(priceProviders(mode).map((p) => p.getPrice(market))),
  ]);

  const retail = aggregateRetail(retailResults);
  const large = firstOk(largeResults);
  const price = firstOk(priceResults);
  const trend = priceTrendOf(price.data);

  return {
    market,
    retail: retail.data,
    retailLabel: retail.label,
    retailSources: retail.sources,
    retailReason: retail.reason,
    large: large.data,
    largeReason: large.reason,
    price: price.data,
    priceReason: price.reason,
    alignment: evaluateAlignment({ retail: retail.data, large: large.data, priceTrend: trend }),
    demo: [retail.data?.meta.demo, large.data?.meta.demo, price.data?.meta.demo].some(Boolean),
  };
}

export async function getAllSnapshots(mode: DataMode = dataMode()): Promise<MarketSnapshot[]> {
  return Promise.all(enabledMarkets().map((m) => getMarketSnapshot(m, mode)));
}

export async function getSnapshotBySlug(
  slug: string,
  mode: DataMode = dataMode(),
): Promise<MarketSnapshot | null> {
  const market = findMarket(slug);
  if (!market) return null;
  return getMarketSnapshot(market, mode);
}
