/**
 * FXCM (SSI) Retail Sentiment Provider — API 接続待ち。
 *
 * FXCM の Speculative Sentiment Index は公開提供が縮小しており、
 * 取得経路が確定するまでは未接続のままにしておく。
 */

import type { Market } from "@/lib/markets";
import {
  unavailable,
  type ProviderResult,
  type RetailSentiment,
  type RetailSentimentProvider,
} from "@/providers/types";

export const fxcmRetailProvider: RetailSentimentProvider = {
  id: "fxcm",
  label: "FXCM",
  async getRetailSentiment(_market: Market): Promise<ProviderResult<RetailSentiment>> {
    if (!process.env.FXCM_API_TOKEN) {
      return unavailable("FXCM", "FXCM_API_TOKEN が未設定");
    }
    return unavailable("FXCM", "API 接続実装待ち (docs/providers.md 参照)");
  },
};
