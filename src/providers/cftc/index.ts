/**
 * CFTC COT / TFF Provider。
 *
 * 「Whale」は正式な市場データではないので、実際に観測できる
 * CFTC の建玉報告から Large Trader / Institutional proxy を推定する。
 *
 * 取得元 (CFTC Public Reporting / Socrata):
 *   TFF Futures Only:          https://publicreporting.cftc.gov/resource/gpe5-46if.json
 *   Disaggregated Futures Only: https://publicreporting.cftc.gov/resource/72hh-3qpy.json
 *
 * 週次データ (対象は火曜・公表は金曜 15:30 ET) であり、リアルタイムにはできない。
 * meta.cadence = "weekly" を必ず立て、UI 側で日付表示にする。
 *
 * 注意: このアダプタは実際の API レスポンスで動作確認できていない
 * (開発環境から外部ホストへ接続できないため)。リソース ID とフィールド名は
 * 初回接続時に実レスポンスで確認すること。想定と違えば値を作らず
 * unavailable を返す。docs/providers.md を参照。
 */

import { cached, ttlByStatus } from "@/lib/cache";
import type { Market } from "@/lib/markets";
import {
  DISAGGREGATED_MANAGED_MONEY,
  REPORT_DATE_FIELD,
  TFF_ASSET_MANAGER,
  TFF_LEVERAGED_FUNDS,
  parseCotRows,
  type CotDataset,
  type CotRow,
} from "@/providers/cftc/cot";
import {
  unavailable,
  type LargeTraderPosition,
  type LargeTraderProvider,
  type ProviderResult,
} from "@/providers/types";

export const CFTC_SOURCE_LABEL = "CFTC";

/** 週次データなので、1 時間キャッシュしても鮮度は落ちない */
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
/** チャート用に取得する週数 */
const WEEKS = 26;

export interface CftcMapping {
  /** CFTC の市場コード (cftc_contract_market_code) */
  contractCode: string;
  /** 参考表示用の契約名 */
  contractName: string;
  dataset: CotDataset;
}

/**
 * 銘柄と CFTC 建玉報告の対応。
 *
 * EUR/JPY・GBP/JPY のようなクロス円は、対応する単一の建玉報告が存在しない。
 * 2 つの契約から合成しても契約単位が異なり根拠のない数字になるため、
 * ここには載せず DATA UNAVAILABLE とする。
 * BTC/USD も Retail 側と揃う粒度の報告がないため対象外。
 */
export const CFTC_MAPPINGS: Record<string, CftcMapping> = {
  usdjpy: { contractCode: "097741", contractName: "JAPANESE YEN - CME", dataset: TFF_LEVERAGED_FUNDS },
  eurusd: { contractCode: "099741", contractName: "EURO FX - CME", dataset: TFF_LEVERAGED_FUNDS },
  gbpusd: { contractCode: "096742", contractName: "BRITISH POUND - CME", dataset: TFF_LEVERAGED_FUNDS },
  xauusd: { contractCode: "088691", contractName: "GOLD - COMEX", dataset: DISAGGREGATED_MANAGED_MONEY },
  jp225: { contractCode: "240741", contractName: "NIKKEI STOCK AVERAGE - CME", dataset: TFF_ASSET_MANAGER },
  nas100: { contractCode: "209742", contractName: "NASDAQ-100 E-MINI - CME", dataset: TFF_LEVERAGED_FUNDS },
};

async function fetchCot(mapping: CftcMapping): Promise<ProviderResult<LargeTraderPosition>> {
  const base = process.env.CFTC_API_BASE ?? "https://publicreporting.cftc.gov";
  const { dataset } = mapping;
  const url =
    `${base}/resource/${dataset.resource}.json` +
    `?cftc_contract_market_code=${encodeURIComponent(mapping.contractCode)}` +
    `&$select=${REPORT_DATE_FIELD},${dataset.longField},${dataset.shortField}` +
    `&$order=${REPORT_DATE_FIELD}%20DESC&$limit=${WEEKS}`;

  let rows: CotRow[];
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    // App Token は無くても取得できるが、付けるとレート制限が緩くなる
    if (process.env.CFTC_APP_TOKEN) headers["X-App-Token"] = process.env.CFTC_APP_TOKEN;

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return unavailable(CFTC_SOURCE_LABEL, `API が ${response.status} を返した`);
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      return unavailable(CFTC_SOURCE_LABEL, "レスポンスが配列ではない");
    }
    rows = body as CotRow[];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return unavailable(CFTC_SOURCE_LABEL, `API に接続できない (${detail})`);
  }

  const parsed = parseCotRows(rows, dataset);
  if (!parsed.ok) return unavailable(CFTC_SOURCE_LABEL, parsed.reason);

  const weeks = parsed.weeks;
  const latest = weeks[weeks.length - 1];
  const previous = weeks.length > 1 ? weeks[weeks.length - 2] : null;

  return {
    status: "ok",
    data: {
      longPosition: latest.longPosition,
      shortPosition: latest.shortPosition,
      netPosition: latest.netPosition,
      previousNetPosition: previous ? previous.netPosition : null,
      history: weeks.map((w) => ({ t: w.reportDate, v: w.netPosition })),
      traderCategory: dataset.category,
      meta: {
        source: `${CFTC_SOURCE_LABEL} (${mapping.contractName})`,
        // 対象週の日付。公表はこの 3 日後だが、データの時点はこちら。
        updatedAt: latest.reportDate,
        cadence: "weekly",
        demo: false,
      },
    },
  };
}

export const cftcLargeTraderProvider: LargeTraderProvider = {
  id: "cftc",
  label: CFTC_SOURCE_LABEL,
  async getLargeTraderPosition(market: Market): Promise<ProviderResult<LargeTraderPosition>> {
    const mapping = CFTC_MAPPINGS[market.slug];
    if (!mapping) {
      return unavailable(CFTC_SOURCE_LABEL, "この銘柄に対応する単一の CFTC 建玉報告がない");
    }
    return cached(
      `cftc:${mapping.dataset.resource}:${mapping.contractCode}`,
      () => fetchCot(mapping),
      ttlByStatus(CACHE_TTL_MS),
    );
  },
};
