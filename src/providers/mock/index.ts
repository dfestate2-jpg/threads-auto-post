/**
 * Mock Provider。UI を完成させるための DEMO データを返す。
 * 返す値はすべて meta.demo = true。
 */

import type { Market } from "@/lib/markets";
import { demoLargeTrader, demoPrice, demoRetail } from "@/providers/mock/demoData";
import {
  unavailable,
  type LargeTraderPosition,
  type LargeTraderProvider,
  type MarketPrice,
  type PriceProvider,
  type ProviderResult,
  type RetailSentiment,
  type RetailSentimentProvider,
} from "@/providers/types";

export const mockRetailProvider: RetailSentimentProvider = {
  id: "demo-retail",
  label: "Mock Provider",
  async getRetailSentiment(market: Market): Promise<ProviderResult<RetailSentiment>> {
    const data = demoRetail(market.slug);
    if (!data) return unavailable("Mock Provider", "この銘柄の Retail Sentiment は DEMO データにも用意していない");
    return { status: "ok", data };
  },
};

export const mockLargeTraderProvider: LargeTraderProvider = {
  id: "demo-large",
  label: "Mock Provider",
  async getLargeTraderPosition(market: Market): Promise<ProviderResult<LargeTraderPosition>> {
    const data = demoLargeTrader(market.slug);
    if (!data) return unavailable("Mock Provider", "この銘柄の Large Trader データは DEMO データにも用意していない");
    return { status: "ok", data };
  },
};

export const mockPriceProvider: PriceProvider = {
  id: "demo-price",
  label: "Mock Provider",
  async getPrice(market: Market): Promise<ProviderResult<MarketPrice>> {
    const data = demoPrice(market.slug);
    if (!data) return unavailable("Mock Provider", "この銘柄の価格は DEMO データにも用意していない");
    return { status: "ok", data };
  },
};
