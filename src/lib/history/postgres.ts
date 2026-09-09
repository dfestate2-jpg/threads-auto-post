/**
 * Postgres への履歴保存。DATABASE_URL が設定されているときに使う。
 *
 * テーブルは db/schema.sql の retail_sentiment。
 * markets に行が無ければ src/lib/markets.ts の定義から作る。
 *
 * 注意: 開発環境から Postgres に接続できないため、実データベースでの
 * 動作確認はできていない。SQL とパラメータの組み立ては
 * tests/history.test.ts で検証してある。
 */

import { findMarket } from "@/lib/markets";
import type { RetailHistoryStore, RetailPoint } from "@/lib/history/types";

/** pg.Pool / pg.Client のうち、ここで使う部分だけ */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export class PostgresRetailHistoryStore implements RetailHistoryStore {
  private readonly marketIds = new Map<string, number>();

  constructor(private readonly db: Queryable) {}

  private async marketId(slug: string): Promise<number | null> {
    const cached = this.marketIds.get(slug);
    if (cached !== undefined) return cached;

    const market = findMarket(slug);
    if (!market) return null;

    // 表示対象の銘柄定義はコード側が正。行が無ければ作る。
    await this.db.query(
      `INSERT INTO markets (symbol, slug, name, category, enabled)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (slug) DO NOTHING`,
      [market.symbol, market.slug, market.nameJa, market.category],
    );

    const found = await this.db.query(`SELECT id FROM markets WHERE slug = $1`, [slug]);
    const id = Number(found.rows[0]?.id);
    if (!Number.isFinite(id)) return null;

    this.marketIds.set(slug, id);
    return id;
  }

  async record(slug: string, provider: string, point: RetailPoint): Promise<void> {
    const id = await this.marketId(slug);
    if (id === null) return;

    const long = point.longPercent;
    await this.db.query(
      `INSERT INTO retail_sentiment (market_id, provider, long_percent, short_percent, timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (market_id, provider, timestamp) DO NOTHING`,
      [id, provider, long, 100 - long, point.t],
    );
  }

  async since(slug: string, since: Date): Promise<RetailPoint[]> {
    const id = await this.marketId(slug);
    if (id === null) return [];

    const result = await this.db.query(
      `SELECT long_percent, timestamp
         FROM retail_sentiment
        WHERE market_id = $1 AND timestamp >= $2
        ORDER BY timestamp ASC`,
      [id, since.toISOString()],
    );

    return result.rows
      .map((row) => ({
        t: new Date(String(row.timestamp)).toISOString(),
        longPercent: Number(row.long_percent),
      }))
      .filter((p) => Number.isFinite(p.longPercent));
  }
}
