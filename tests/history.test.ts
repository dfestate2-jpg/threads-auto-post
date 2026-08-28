import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeOver } from "@/lib/history/types";
import { InMemoryRetailHistoryStore } from "@/lib/history/memory";
import { PostgresRetailHistoryStore, type Queryable } from "@/lib/history/postgres";
import { retailHistoryStore, setRetailHistoryStore } from "@/lib/history";
import { clearCache } from "@/lib/cache";
import { getSnapshotBySlug } from "@/lib/snapshot";

const HOUR = 60 * 60 * 1000;

function point(hoursAgo: number, longPercent: number, now = new Date("2026-08-28T12:00:00.000Z")) {
  return { t: new Date(now.getTime() - hoursAgo * HOUR).toISOString(), longPercent };
}

describe("changeOver", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");

  it("指定した時間だけ遡った点との差を出す", () => {
    const points = [point(25, 60, now), point(24, 61, now), point(1, 65, now), point(0, 68, now)];
    expect(changeOver(points, HOUR)).toBe(3); // 1h 前は 65
    expect(changeOver(points, 24 * HOUR)).toBe(7); // 24h 前は 61
  });

  it("遡った時点より古い点が無ければ null (0 で埋めない)", () => {
    const points = [point(0.5, 66, now), point(0, 68, now)];
    expect(changeOver(points, HOUR)).toBeNull();
    expect(changeOver(points, 24 * HOUR)).toBeNull();
  });

  it("点が 1 つ以下なら null", () => {
    expect(changeOver([], HOUR)).toBeNull();
    expect(changeOver([point(0, 68, now)], HOUR)).toBeNull();
  });

  it("基準は壁時計ではなく最新の観測時刻に合わせる", () => {
    // 全体が 3 日前のデータでも、最新から 1h 前の点があれば変化は出せる
    // (古さは「Updated: 何時間前」で示す。ここで 0 を返すと誤解を招く)
    const old = [point(74, 60, now), point(73, 62, now)];
    expect(changeOver(old, HOUR)).toBe(2);

    // 最新から 1h 以上遡った点が無ければ null (最新点どうしを比べて 0 にしない)
    const tooShort = [point(73.5, 60, now), point(73, 62, now)];
    expect(changeOver(tooShort, HOUR)).toBeNull();
  });
});

describe("InMemoryRetailHistoryStore", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");

  it("古い順で返し、since より前は返さない", async () => {
    const store = new InMemoryRetailHistoryStore();
    await store.record("usdjpy", "OANDA", point(3, 60, now));
    await store.record("usdjpy", "OANDA", point(1, 65, now));
    await store.record("usdjpy", "OANDA", point(2, 62, now));

    const all = await store.since("usdjpy", new Date(now.getTime() - 4 * HOUR));
    expect(all.map((p) => p.longPercent)).toEqual([60, 62, 65]);

    const recent = await store.since("usdjpy", new Date(now.getTime() - 90 * 60 * 1000));
    expect(recent.map((p) => p.longPercent)).toEqual([65]);
  });

  it("同じ観測時刻は二重に持たない", async () => {
    const store = new InMemoryRetailHistoryStore();
    await store.record("usdjpy", "OANDA", point(1, 65, now));
    await store.record("usdjpy", "OANDA", point(1, 65, now));
    await store.record("usdjpy", "OANDA", point(1, 66, now));

    const points = await store.since("usdjpy", new Date(0));
    expect(points).toHaveLength(1);
  });

  it("保持期間より古い点は落とす", async () => {
    const store = new InMemoryRetailHistoryStore(2 * HOUR);
    await store.record("usdjpy", "OANDA", point(5, 60, now));
    await store.record("usdjpy", "OANDA", point(1, 65, now));

    const points = await store.since("usdjpy", new Date(0));
    expect(points.map((p) => p.longPercent)).toEqual([65]);
  });

  it("銘柄ごとに分かれている", async () => {
    const store = new InMemoryRetailHistoryStore();
    await store.record("usdjpy", "OANDA", point(1, 65, now));
    expect(await store.since("eurusd", new Date(0))).toEqual([]);
  });
});

describe("PostgresRetailHistoryStore", () => {
  function fakeDb() {
    const calls: { text: string; params: unknown[] }[] = [];
    const db: Queryable = {
      async query(text: string, params: unknown[] = []) {
        calls.push({ text, params });
        if (text.includes("SELECT id FROM markets")) return { rows: [{ id: 7 }] };
        if (text.includes("FROM retail_sentiment")) {
          return {
            rows: [
              { long_percent: "61.00", timestamp: "2026-08-27T12:00:00.000Z" },
              { long_percent: "68.00", timestamp: "2026-08-28T12:00:00.000Z" },
            ],
          };
        }
        return { rows: [] };
      },
    };
    return { db, calls };
  }

  it("markets を用意してから retail_sentiment に入れる (重複は無視)", async () => {
    const { db, calls } = fakeDb();
    const store = new PostgresRetailHistoryStore(db);
    await store.record("usdjpy", "OANDA", { t: "2026-08-28T12:00:00.000Z", longPercent: 68 });

    const insert = calls.find((c) => c.text.includes("INSERT INTO retail_sentiment"));
    expect(insert).toBeDefined();
    expect(insert?.text).toContain("ON CONFLICT (market_id, provider, timestamp) DO NOTHING");
    expect(insert?.params).toEqual([7, "OANDA", 68, 32, "2026-08-28T12:00:00.000Z"]);

    expect(calls.some((c) => c.text.includes("INSERT INTO markets"))).toBe(true);
  });

  it("market_id は 1 度引いたら使い回す", async () => {
    const { db, calls } = fakeDb();
    const store = new PostgresRetailHistoryStore(db);
    await store.record("usdjpy", "OANDA", { t: "2026-08-28T12:00:00.000Z", longPercent: 68 });
    await store.record("usdjpy", "OANDA", { t: "2026-08-28T12:20:00.000Z", longPercent: 69 });

    expect(calls.filter((c) => c.text.includes("SELECT id FROM markets"))).toHaveLength(1);
  });

  it("NUMERIC で返る値を数値に直して古い順で返す", async () => {
    const { db } = fakeDb();
    const store = new PostgresRetailHistoryStore(db);
    const points = await store.since("usdjpy", new Date("2026-08-26T12:00:00.000Z"));

    expect(points).toEqual([
      { t: "2026-08-27T12:00:00.000Z", longPercent: 61 },
      { t: "2026-08-28T12:00:00.000Z", longPercent: 68 },
    ]);
  });

  it("表示対象でない銘柄には触らない", async () => {
    const { db, calls } = fakeDb();
    const store = new PostgresRetailHistoryStore(db);
    await store.record("audusd", "OANDA", { t: "2026-08-28T12:00:00.000Z", longPercent: 68 });
    expect(calls).toHaveLength(0);
  });
});

describe("スナップショットへの履歴の反映", () => {
  beforeEach(() => {
    clearCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          positionBook: {
            time: "2026-08-28T12:00:00.000Z",
            buckets: [{ longCountPercent: "68", shortCountPercent: "32" }],
          },
        }),
      ),
    );
    vi.stubEnv("OANDA_API_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearCache();
  });

  it("貯まっていない間は 1h / 24h を出さない", async () => {
    const store = new InMemoryRetailHistoryStore();
    const snapshot = await getSnapshotBySlug("usdjpy", "live", store);

    expect(snapshot?.retail?.longPercent).toBe(68);
    expect(snapshot?.retail?.change1h).toBeNull();
    expect(snapshot?.retail?.change24h).toBeNull();
  });

  it("過去の点が貯まっていれば 1h / 24h 変化と履歴を出す", async () => {
    const store = new InMemoryRetailHistoryStore();
    const now = new Date("2026-08-28T12:00:00.000Z");
    await store.record("usdjpy", "OANDA", point(25, 60, now));
    await store.record("usdjpy", "OANDA", point(24, 61, now));
    await store.record("usdjpy", "OANDA", point(1, 65, now));

    const snapshot = await getSnapshotBySlug("usdjpy", "live", store);

    expect(snapshot?.retail?.change1h).toBe(3);
    expect(snapshot?.retail?.change24h).toBe(7);
    expect(snapshot?.retail?.history).toHaveLength(4);
    expect(snapshot?.retail?.history.at(-1)?.v).toBe(68);
  });

  it("履歴保存が落ちても現在値は出す", async () => {
    const broken = {
      async record() {
        throw new Error("db down");
      },
      async since() {
        throw new Error("db down");
      },
    };

    const snapshot = await getSnapshotBySlug("usdjpy", "live", broken);
    expect(snapshot?.retail?.longPercent).toBe(68);
    expect(snapshot?.retail?.history).toEqual([]);
  });
});

describe("保存先の選択", () => {
  afterEach(() => {
    setRetailHistoryStore(null);
    vi.unstubAllEnvs();
  });

  it("DATABASE_URL が無ければメモリに貯める", () => {
    setRetailHistoryStore(null);
    expect(retailHistoryStore()).toBeInstanceOf(InMemoryRetailHistoryStore);
  });

  it("DATABASE_URL があれば Postgres に貯める", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/sentiment");
    setRetailHistoryStore(null);
    expect(retailHistoryStore()).toBeInstanceOf(PostgresRetailHistoryStore);
  });
});
