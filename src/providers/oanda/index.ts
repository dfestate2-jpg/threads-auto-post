/**
 * OANDA Retail Sentiment Provider — API 接続待ち。
 *
 * OANDA の Position Book / Order Book は口座付きの API トークンが必要で、
 * 現時点では接続していない。実装が入るまでは「取得できない」と返すだけにして、
 * 推測値を実データとして出さない。
 *
 * 実装時の接続先 (予定):
 *   GET {OANDA_API_BASE}/v3/instruments/{instrument}/positionBook
 *   Authorization: Bearer {OANDA_API_TOKEN}
 */

import type { Market } from "@/lib/markets";
import {
  unavailable,
  type ProviderResult,
  type RetailSentiment,
  type RetailSentimentProvider,
} from "@/providers/types";

export const OANDA_SOURCE_LABEL = "OANDA";

/** OANDA の instrument 表記へのマッピング。ここにない銘柄は取得対象外。 */
export const OANDA_INSTRUMENTS: Record<string, string> = {
  usdjpy: "USD_JPY",
  eurjpy: "EUR_JPY",
  gbpjpy: "GBP_JPY",
  eurusd: "EUR_USD",
  gbpusd: "GBP_USD",
  xauusd: "XAU_USD",
  btcusd: "BTC_USD",
  jp225: "JP225_USD",
  nas100: "NAS100_USD",
};

export const oandaRetailProvider: RetailSentimentProvider = {
  id: "oanda",
  label: OANDA_SOURCE_LABEL,
  async getRetailSentiment(market: Market): Promise<ProviderResult<RetailSentiment>> {
    const instrument = OANDA_INSTRUMENTS[market.slug];
    if (!instrument) {
      return unavailable(OANDA_SOURCE_LABEL, "OANDA に対応する instrument がない");
    }
    if (!process.env.OANDA_API_TOKEN) {
      return unavailable(OANDA_SOURCE_LABEL, "OANDA_API_TOKEN が未設定");
    }
    return unavailable(OANDA_SOURCE_LABEL, "API 接続実装待ち (docs/providers.md 参照)");
  },
};
