/**
 * Price Provider — API 接続待ち。
 *
 * 価格は Alignment の補助にしか使わないので、取得できない場合は
 * 価格なしで Retail / Large だけを評価する。
 */

import type { Market } from "@/lib/markets";
import {
  unavailable,
  type MarketPrice,
  type PriceProvider,
  type ProviderResult,
} from "@/providers/types";

export const priceProvider: PriceProvider = {
  id: "price",
  label: "Price Feed",
  async getPrice(_market: Market): Promise<ProviderResult<MarketPrice>> {
    if (!process.env.PRICE_API_TOKEN) {
      return unavailable("Price Feed", "PRICE_API_TOKEN が未設定");
    }
    return unavailable("Price Feed", "API 接続実装待ち (docs/providers.md 参照)");
  },
};
