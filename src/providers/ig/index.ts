/**
 * IG Client Sentiment Provider — API 接続待ち。
 *
 * IG の Client Sentiment API は API キー + アカウントが必要。
 * 接続後は OANDA と合わせて Aggregated Retail Sentiment として統合する。
 */

import type { Market } from "@/lib/markets";
import {
  unavailable,
  type ProviderResult,
  type RetailSentiment,
  type RetailSentimentProvider,
} from "@/providers/types";

export const igRetailProvider: RetailSentimentProvider = {
  id: "ig",
  label: "IG",
  async getRetailSentiment(_market: Market): Promise<ProviderResult<RetailSentiment>> {
    if (!process.env.IG_API_KEY) {
      return unavailable("IG", "IG_API_KEY が未設定");
    }
    return unavailable("IG", "API 接続実装待ち (docs/providers.md 参照)");
  },
};
