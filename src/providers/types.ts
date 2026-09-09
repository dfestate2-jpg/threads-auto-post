/**
 * Provider Adapter の共通インターフェース。
 *
 * Retail / Large Trader / Price の 3 系統に分け、それぞれの Provider は
 * 「データを返す」か「取得できない理由を返す」かのどちらかしか返さない。
 * 推測値を実データとして返してはならない (demo フラグで必ず区別する)。
 */

import type { Market } from "@/lib/markets";

export type Bias = "LONG" | "SHORT" | "NEUTRAL";
export type Trend = "UP" | "DOWN" | "FLAT";

/**
 * データの更新頻度。週次データをリアルタイムと誤解させないために持つ。
 * "snapshot20m" は OANDA の Position Book のように 20 分ごとに更新されるもの。
 */
export type Cadence = "realtime" | "snapshot20m" | "hourly" | "daily" | "weekly";

export interface DataMeta {
  /** 表示するデータ提供元名 (例: "OANDA", "CFTC TFF") */
  source: string;
  /** データの時刻 (ISO 8601) */
  updatedAt: string;
  cadence: Cadence;
  /** true の場合、UI に必ず DEMO DATA と明示する */
  demo: boolean;
}

export interface SeriesPoint {
  t: string;
  v: number;
}

export interface RetailSentiment {
  longPercent: number;
  shortPercent: number;
  /** 直近 1 時間 / 24 時間の Long% の変化 (ポイント)。取得できなければ null */
  change1h: number | null;
  change24h: number | null;
  /** Long% の履歴 (古い順) */
  history: SeriesPoint[];
  meta: DataMeta;
}

export interface LargeTraderPosition {
  /** 建玉枚数 (contracts) */
  longPosition: number;
  shortPosition: number;
  netPosition: number;
  /** 前週の Net。取得できなければ null */
  previousNetPosition: number | null;
  /** Net の履歴 (古い順) */
  history: SeriesPoint[];
  /** CFTC TFF のどの分類を Large / Institutional proxy として使ったか */
  traderCategory: string;
  meta: DataMeta;
}

export interface MarketPrice {
  price: number;
  change24hPercent: number | null;
  history: SeriesPoint[];
  meta: DataMeta;
}

export type ProviderResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; source: string; reason: string };

export function unavailable<T>(source: string, reason: string): ProviderResult<T> {
  return { status: "unavailable", source, reason };
}

export interface RetailSentimentProvider {
  readonly id: string;
  readonly label: string;
  getRetailSentiment(market: Market): Promise<ProviderResult<RetailSentiment>>;
}

export interface LargeTraderProvider {
  readonly id: string;
  readonly label: string;
  getLargeTraderPosition(market: Market): Promise<ProviderResult<LargeTraderPosition>>;
}

export interface PriceProvider {
  readonly id: string;
  readonly label: string;
  getPrice(market: Market): Promise<ProviderResult<MarketPrice>>;
}
