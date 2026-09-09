/**
 * メモリ上の履歴保存。DATABASE_URL が無いときの既定。
 *
 * プロセスが生きている間だけ保持する。単一サーバーで動かしていれば
 * 時間が経つにつれ 1h / 24h 変化とチャートが出せるようになるが、
 * 再起動で消えるため、永続化が要るなら Postgres 実装を使う。
 */

import type { RetailHistoryStore, RetailPoint } from "@/lib/history/types";

/** 保持する期間。チャートは 48 時間分あれば足りる。 */
const RETENTION_MS = 48 * 60 * 60 * 1000;

export class InMemoryRetailHistoryStore implements RetailHistoryStore {
  private readonly series = new Map<string, RetailPoint[]>();

  constructor(private readonly retentionMs: number = RETENTION_MS) {}

  async record(slug: string, _provider: string, point: RetailPoint): Promise<void> {
    const at = new Date(point.t).getTime();
    if (!Number.isFinite(at)) return;

    const points = this.series.get(slug) ?? [];
    // 同じ観測時刻は二重に持たない (ページを開くたびに増やさない)
    if (points.some((p) => p.t === point.t)) return;

    points.push(point);
    points.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

    const cutoff = at - this.retentionMs;
    this.series.set(
      slug,
      points.filter((p) => new Date(p.t).getTime() >= cutoff),
    );
  }

  async since(slug: string, since: Date): Promise<RetailPoint[]> {
    const points = this.series.get(slug) ?? [];
    return points.filter((p) => new Date(p.t).getTime() >= since.getTime());
  }

  clear(): void {
    this.series.clear();
  }
}
