/**
 * 履歴保存の切り替え。
 *
 * DATABASE_URL があれば Postgres、無ければメモリ。
 * どちらも無理なら履歴なし (1h / 24h は「—」、チャートは非表示) になるだけで、
 * 推測値は作らない。
 */

import { InMemoryRetailHistoryStore } from "@/lib/history/memory";
import { PostgresRetailHistoryStore } from "@/lib/history/postgres";
import type { RetailHistoryStore } from "@/lib/history/types";

let store: RetailHistoryStore | null = null;

export function retailHistoryStore(): RetailHistoryStore {
  if (store) return store;

  const url = process.env.DATABASE_URL;
  if (url) {
    // pg は Postgres を使うときだけ読み込む (未使用時に依存させない)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require("pg") as typeof import("pg");
    store = new PostgresRetailHistoryStore(new Pool({ connectionString: url, max: 3 }));
  } else {
    store = new InMemoryRetailHistoryStore();
  }
  return store;
}

/** テスト用 */
export function setRetailHistoryStore(next: RetailHistoryStore | null): void {
  store = next;
}

export { InMemoryRetailHistoryStore } from "@/lib/history/memory";
export { PostgresRetailHistoryStore } from "@/lib/history/postgres";
export * from "@/lib/history/types";
