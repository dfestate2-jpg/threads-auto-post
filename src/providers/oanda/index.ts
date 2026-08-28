/**
 * OANDA Retail Sentiment Provider。
 *
 * 取得元: GET {OANDA_API_BASE}/v3/instruments/{instrument}/positionBook
 *         Authorization: Bearer {OANDA_API_TOKEN}
 *
 * Position Book は約 20 分ごとに更新されるスナップショット。
 * 取得できるのは OANDA の顧客ポジションであり市場全体ではないため、
 * 表示ラベルには提供元名 (OANDA) を必ず残す。
 *
 * 注意: このアダプタは実際の API レスポンスで動作確認できていない
 * (開発環境から外部ホストへ接続できないため)。想定と違う形式だった場合は
 * 値を作らず unavailable を返すようにしてある。docs/providers.md を参照。
 */

import { cached, ttlByStatus } from "@/lib/cache";
import type { Market } from "@/lib/markets";
import { parsePositionBook, type PositionBookResponse } from "@/providers/oanda/positionBook";
import {
  unavailable,
  type ProviderResult,
  type RetailSentiment,
  type RetailSentimentProvider,
} from "@/providers/types";

export const OANDA_SOURCE_LABEL = "OANDA";

/** Position Book の更新間隔に合わせたキャッシュ TTL */
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

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

async function fetchPositionBook(instrument: string): Promise<ProviderResult<RetailSentiment>> {
  const base = process.env.OANDA_API_BASE ?? "https://api-fxtrade.oanda.com";
  const token = process.env.OANDA_API_TOKEN;
  if (!token) return unavailable(OANDA_SOURCE_LABEL, "OANDA_API_TOKEN が未設定");

  let body: PositionBookResponse;
  try {
    const response = await fetch(`${base}/v3/instruments/${instrument}/positionBook`, {
      headers: { Authorization: `Bearer ${token}`, "Accept-Datetime-Format": "RFC3339" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return unavailable(OANDA_SOURCE_LABEL, `API が ${response.status} を返した`);
    }
    body = (await response.json()) as PositionBookResponse;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return unavailable(OANDA_SOURCE_LABEL, `API に接続できない (${detail})`);
  }

  const parsed = parsePositionBook(body);
  if (!parsed.ok) return unavailable(OANDA_SOURCE_LABEL, parsed.reason);

  return {
    status: "ok",
    data: {
      longPercent: parsed.longPercent,
      shortPercent: parsed.shortPercent,
      // Position Book はスナップショットのみで履歴を返さない。
      // 1h / 24h 変化と履歴チャートは、DB に貯め始めてから出す。
      change1h: null,
      change24h: null,
      history: [],
      meta: {
        source: OANDA_SOURCE_LABEL,
        updatedAt: parsed.time,
        cadence: "snapshot20m",
        demo: false,
      },
    },
  };
}

export const oandaRetailProvider: RetailSentimentProvider = {
  id: "oanda",
  label: OANDA_SOURCE_LABEL,
  async getRetailSentiment(market: Market): Promise<ProviderResult<RetailSentiment>> {
    const instrument = OANDA_INSTRUMENTS[market.slug];
    if (!instrument) {
      return unavailable(OANDA_SOURCE_LABEL, "OANDA に対応する instrument がない");
    }
    return cached(`oanda:${instrument}`, () => fetchPositionBook(instrument), ttlByStatus(CACHE_TTL_MS));
  },
};
