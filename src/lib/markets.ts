/**
 * MVP で表示する銘柄の定義。
 * ここに追加すれば TOP ページ / 詳細ページ / API すべてに反映される構造にしてあるが、
 * MVP ではこの 9 銘柄以外を出さない。
 */

export type MarketCategory = "FX" | "METAL" | "CRYPTO" | "INDEX";

export interface Market {
  /** 表示用シンボル (例: USD/JPY) */
  symbol: string;
  /** URL に使う識別子 (例: usdjpy) */
  slug: string;
  /** 短縮表示 (カード用) */
  shortLabel: string;
  /** 日本語名 */
  nameJa: string;
  category: MarketCategory;
  /** 価格表示の小数桁 */
  priceDecimals: number;
  enabled: boolean;
}

export const MARKETS: Market[] = [
  { symbol: "USD/JPY", slug: "usdjpy", shortLabel: "USDJPY", nameJa: "ドル円", category: "FX", priceDecimals: 3, enabled: true },
  { symbol: "EUR/JPY", slug: "eurjpy", shortLabel: "EURJPY", nameJa: "ユーロ円", category: "FX", priceDecimals: 3, enabled: true },
  { symbol: "GBP/JPY", slug: "gbpjpy", shortLabel: "GBPJPY", nameJa: "ポンド円", category: "FX", priceDecimals: 3, enabled: true },
  { symbol: "EUR/USD", slug: "eurusd", shortLabel: "EURUSD", nameJa: "ユーロドル", category: "FX", priceDecimals: 5, enabled: true },
  { symbol: "GBP/USD", slug: "gbpusd", shortLabel: "GBPUSD", nameJa: "ポンドドル", category: "FX", priceDecimals: 5, enabled: true },
  { symbol: "XAU/USD", slug: "xauusd", shortLabel: "GOLD", nameJa: "ゴールド", category: "METAL", priceDecimals: 2, enabled: true },
  { symbol: "BTC/USD", slug: "btcusd", shortLabel: "BTC", nameJa: "ビットコイン", category: "CRYPTO", priceDecimals: 0, enabled: true },
  { symbol: "JP225", slug: "jp225", shortLabel: "NIKKEI", nameJa: "日経225", category: "INDEX", priceDecimals: 0, enabled: true },
  { symbol: "NAS100", slug: "nas100", shortLabel: "NASDAQ", nameJa: "ナスダック100", category: "INDEX", priceDecimals: 0, enabled: true },
];

export function enabledMarkets(): Market[] {
  return MARKETS.filter((m) => m.enabled);
}

export function findMarket(slug: string): Market | undefined {
  return MARKETS.find((m) => m.slug === slug.toLowerCase() && m.enabled);
}
