/**
 * 定期取得。全銘柄の Retail を取りに行き、履歴に貯める。
 *
 * 画面を開いたときにも履歴は貯まるが、それだけだと誰も見ていない時間帯が
 * 歯抜けになる。20 分ごと (OANDA の更新間隔) に叩かれる前提。
 *
 * 注意: 保存先がメモリの場合、貯まるのは「この呼び出しを処理した
 * プロセスの中」だけ。サーバーレスでは画面を出すインスタンスと別になり得るので、
 * 定期取得が意味を持つのは DATABASE_URL を設定したときだけ。
 */

import { historyStorageKind, retailHistoryStore, type RetailHistoryStore } from "@/lib/history";
import { getAllSnapshots } from "@/lib/snapshot";
import { dataMode, type DataMode } from "@/providers/registry";

export interface CollectedMarket {
  slug: string;
  /** 履歴に貯めたか */
  recorded: boolean;
  longPercent: number | null;
  source: string | null;
  /** 貯めなかった理由 */
  reason: string | null;
}

export interface CollectionSummary {
  mode: DataMode;
  storage: "postgres" | "memory";
  /** 貯まらない設定で呼ばれたときの注意書き */
  warning: string | null;
  recorded: number;
  markets: CollectedMarket[];
}

export async function collectRetailHistory(
  mode: DataMode = dataMode(),
  store: RetailHistoryStore = retailHistoryStore(),
): Promise<CollectionSummary> {
  // 取得と保存は getMarketSnapshot 側で行われる (画面表示と同じ経路を使う)
  const snapshots = await getAllSnapshots(mode, store);

  const markets: CollectedMarket[] = snapshots.map((snapshot) => {
    const retail = snapshot.retail;
    if (!retail) {
      return {
        slug: snapshot.market.slug,
        recorded: false,
        longPercent: null,
        source: null,
        reason: snapshot.retailReason,
      };
    }
    if (retail.meta.demo) {
      return {
        slug: snapshot.market.slug,
        recorded: false,
        longPercent: retail.longPercent,
        source: retail.meta.source,
        reason: "DEMO データは履歴に貯めない",
      };
    }
    return {
      slug: snapshot.market.slug,
      recorded: true,
      longPercent: retail.longPercent,
      source: retail.meta.source,
      reason: null,
    };
  });

  const storage = historyStorageKind();
  const warning =
    mode === "demo"
      ? "DATA_MODE=demo のため実データを貯めていない"
      : storage === "memory"
        ? "DATABASE_URL が未設定。履歴はこのプロセスのメモリにしか残らないため、定期取得の効果はない"
        : null;

  return {
    mode,
    storage,
    warning,
    recorded: markets.filter((m) => m.recorded).length,
    markets,
  };
}
