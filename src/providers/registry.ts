/**
 * どの Provider を使うかを決める場所。
 *
 * DATA_MODE=demo (既定) … Mock Provider だけを使い、UI 上は DEMO DATA と表示する
 * DATA_MODE=live        … 実データ Provider を使う。未接続のものは
 *                          DATA UNAVAILABLE になるだけで、推測値は出さない。
 */

import { cftcLargeTraderProvider } from "@/providers/cftc";
import { fxcmRetailProvider } from "@/providers/fxcm";
import { igRetailProvider } from "@/providers/ig";
import { mockLargeTraderProvider, mockPriceProvider, mockRetailProvider } from "@/providers/mock";
import { oandaRetailProvider } from "@/providers/oanda";
import { priceProvider } from "@/providers/price";
import type { LargeTraderProvider, PriceProvider, RetailSentimentProvider } from "@/providers/types";

export type DataMode = "demo" | "live";

export function dataMode(): DataMode {
  return process.env.DATA_MODE === "live" ? "live" : "demo";
}

export function retailProviders(mode: DataMode = dataMode()): RetailSentimentProvider[] {
  if (mode === "demo") return [mockRetailProvider];
  return [oandaRetailProvider, igRetailProvider, fxcmRetailProvider];
}

export function largeTraderProviders(mode: DataMode = dataMode()): LargeTraderProvider[] {
  if (mode === "demo") return [mockLargeTraderProvider];
  return [cftcLargeTraderProvider];
}

export function priceProviders(mode: DataMode = dataMode()): PriceProvider[] {
  if (mode === "demo") return [mockPriceProvider];
  return [priceProvider];
}
