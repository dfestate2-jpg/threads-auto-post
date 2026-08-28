/**
 * CFTC 建玉報告 (COT / TFF) のレスポンス解析。
 *
 * fetch と切り離した純粋な関数にしてある (ネットワークなしでテストするため)。
 *
 * 週次データで、対象は火曜・公表は金曜 15:30 ET。最新行を今週、
 * 1 つ前の行を前週として扱う。フィールド名が想定と違った場合は
 * 値を作らず、どのフィールドが無いかを理由にして返す。
 */

export interface CotDataset {
  /** Socrata のリソース ID */
  resource: string;
  /** Large / Institutional proxy として使う分類の表示名 */
  category: string;
  longField: string;
  shortField: string;
}

/** TFF (Traders in Financial Futures) — 通貨・株価指数 */
export const TFF_LEVERAGED_FUNDS: CotDataset = {
  resource: "gpe5-46if",
  category: "Leveraged Funds",
  longField: "lev_money_positions_long",
  shortField: "lev_money_positions_short",
};

export const TFF_ASSET_MANAGER: CotDataset = {
  resource: "gpe5-46if",
  category: "Asset Manager",
  longField: "asset_mgr_positions_long",
  shortField: "asset_mgr_positions_short",
};

/** Disaggregated — 商品 (GOLD など) */
export const DISAGGREGATED_MANAGED_MONEY: CotDataset = {
  resource: "72hh-3qpy",
  category: "Managed Money",
  longField: "m_money_positions_long_all",
  shortField: "m_money_positions_short_all",
};

export const REPORT_DATE_FIELD = "report_date_as_yyyy_mm_dd";

export type CotRow = Record<string, unknown>;

export interface ParsedCotWeek {
  reportDate: string;
  longPosition: number;
  shortPosition: number;
  netPosition: number;
}

export type ParsedCot = { ok: true; weeks: ParsedCotWeek[] } | { ok: false; reason: string };

/**
 * 新しい順で受け取った行を、古い順の週次データに変換する。
 * 1 行も読めなければエラー扱いにして、部分的な推測はしない。
 */
export function parseCotRows(rows: CotRow[], dataset: CotDataset): ParsedCot {
  if (rows.length === 0) return { ok: false, reason: "対象の建玉報告が返ってこなかった" };

  const weeks: ParsedCotWeek[] = [];
  for (const row of rows) {
    const reportDate = row[REPORT_DATE_FIELD];
    if (typeof reportDate !== "string") {
      return { ok: false, reason: `${REPORT_DATE_FIELD} がレスポンスに無い` };
    }
    const long = Number(row[dataset.longField]);
    const short = Number(row[dataset.shortField]);
    if (!Number.isFinite(long) || !Number.isFinite(short)) {
      return {
        ok: false,
        reason: `${dataset.longField} / ${dataset.shortField} を数値として読めない (データセットのフィールド名を確認)`,
      };
    }
    weeks.push({
      reportDate: new Date(reportDate).toISOString(),
      longPosition: long,
      shortPosition: short,
      netPosition: long - short,
    });
  }

  // API は新しい順で返るため、チャート用に古い順へ直す
  weeks.reverse();
  return { ok: true, weeks };
}
