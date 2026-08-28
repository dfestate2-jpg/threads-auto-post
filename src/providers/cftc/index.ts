/**
 * CFTC COT / TFF Provider — API 接続待ち。
 *
 * 「Whale」は正式な市場データではないので、実際に観測できる
 * CFTC の建玉報告から Large Trader / Institutional proxy を推定する。
 *
 * TFF (Traders in Financial Futures) の分類:
 *   Dealer / Asset Manager / Leveraged Funds / Other Reportables / Non-Reportables
 * このうち Leveraged Funds (商品は Managed Money) を Large / Institutional proxy として扱う。
 *
 * 実装時の接続先 (予定):
 *   https://publicreporting.cftc.gov/resource/gpe5-46if.json  (TFF Futures Only)
 *   https://publicreporting.cftc.gov/resource/6dca-aqww.json  (Disaggregated Futures Only)
 */

import type { Market } from "@/lib/markets";
import {
  unavailable,
  type LargeTraderPosition,
  type LargeTraderProvider,
  type ProviderResult,
} from "@/providers/types";

export const CFTC_SOURCE_LABEL = "CFTC";

export interface CftcMapping {
  /** CFTC の市場コード (contract_market_code) */
  contractCode: string;
  /** 参考表示用の契約名 */
  contractName: string;
  /** Large proxy として使う分類 */
  traderCategory: string;
}

/**
 * 銘柄と CFTC 建玉報告の対応。
 * BTC のように「Retail 側と同じ粒度では対応させにくい」ものは意図的に載せない。
 */
export const CFTC_MAPPINGS: Record<string, CftcMapping> = {
  usdjpy: { contractCode: "097741", contractName: "JAPANESE YEN - CME", traderCategory: "Leveraged Funds" },
  eurjpy: { contractCode: "097741", contractName: "JAPANESE YEN - CME", traderCategory: "Leveraged Funds" },
  gbpjpy: { contractCode: "096742", contractName: "BRITISH POUND - CME", traderCategory: "Leveraged Funds" },
  eurusd: { contractCode: "099741", contractName: "EURO FX - CME", traderCategory: "Leveraged Funds" },
  gbpusd: { contractCode: "096742", contractName: "BRITISH POUND - CME", traderCategory: "Leveraged Funds" },
  xauusd: { contractCode: "088691", contractName: "GOLD - COMEX", traderCategory: "Managed Money" },
  jp225: { contractCode: "240741", contractName: "NIKKEI STOCK AVERAGE - CME", traderCategory: "Asset Manager" },
  nas100: { contractCode: "209742", contractName: "NASDAQ-100 E-MINI - CME", traderCategory: "Leveraged Funds" },
};

export const cftcLargeTraderProvider: LargeTraderProvider = {
  id: "cftc",
  label: CFTC_SOURCE_LABEL,
  async getLargeTraderPosition(market: Market): Promise<ProviderResult<LargeTraderPosition>> {
    const mapping = CFTC_MAPPINGS[market.slug];
    if (!mapping) {
      return unavailable(CFTC_SOURCE_LABEL, "この銘柄に対応する CFTC 建玉報告がない");
    }
    return unavailable(CFTC_SOURCE_LABEL, "API 接続実装待ち (docs/providers.md 参照)");
  },
};
