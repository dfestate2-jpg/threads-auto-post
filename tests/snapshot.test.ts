import { describe, expect, it } from "vitest";
import { MARKETS, findMarket } from "@/lib/markets";
import { aggregateRetail, getAllSnapshots, getSnapshotBySlug, priceTrendOf } from "@/lib/snapshot";
import type { ProviderResult, RetailSentiment } from "@/providers/types";

function ok(source: string, longPercent: number): ProviderResult<RetailSentiment> {
  return {
    status: "ok",
    data: {
      longPercent,
      shortPercent: 100 - longPercent,
      change1h: 1,
      change24h: 2,
      history: [],
      meta: { source, updatedAt: "2026-08-28T00:00:00.000Z", cadence: "hourly", demo: false },
    },
  };
}

describe("aggregateRetail", () => {
  it("1 社だけなら提供元名を残したラベルにする", () => {
    const result = aggregateRetail([ok("OANDA", 68)]);
    expect(result.label).toBe("OANDA Retail Sentiment");
    expect(result.data?.longPercent).toBe(68);
  });

  it("複数社あれば Aggregated として平均する", () => {
    const result = aggregateRetail([ok("OANDA", 68), ok("IG", 62)]);
    expect(result.label).toBe("Aggregated Retail Sentiment (OANDA + IG)");
    expect(result.data?.longPercent).toBe(65);
    expect(result.data?.shortPercent).toBe(35);
    expect(result.sources).toEqual(["OANDA", "IG"]);
  });

  it("どれも取得できなければ理由付きで null を返す (推測値を作らない)", () => {
    const result = aggregateRetail([
      { status: "unavailable", source: "OANDA", reason: "API 接続実装待ち" },
      { status: "unavailable", source: "IG", reason: "IG_API_KEY が未設定" },
    ]);
    expect(result.data).toBeNull();
    expect(result.reason).toContain("OANDA");
    expect(result.reason).toContain("IG");
  });
});

describe("priceTrendOf", () => {
  it("24 時間変化率から UP / DOWN / FLAT を出す", () => {
    const base = { price: 1, history: [], meta: { source: "T", updatedAt: "", cadence: "realtime" as const, demo: true } };
    expect(priceTrendOf({ ...base, change24hPercent: 0.5 })).toBe("UP");
    expect(priceTrendOf({ ...base, change24hPercent: -0.5 })).toBe("DOWN");
    expect(priceTrendOf({ ...base, change24hPercent: 0.02 })).toBe("FLAT");
    expect(priceTrendOf({ ...base, change24hPercent: null })).toBeNull();
    expect(priceTrendOf(null)).toBeNull();
  });
});

describe("demo モードのスナップショット", () => {
  it("MVP の 9 銘柄をこの順で返す", async () => {
    const snapshots = await getAllSnapshots("demo");
    expect(snapshots.map((s) => s.market.slug)).toEqual([
      "usdjpy",
      "eurjpy",
      "gbpjpy",
      "eurusd",
      "gbpusd",
      "xauusd",
      "btcusd",
      "jp225",
      "nas100",
    ]);
    expect(MARKETS).toHaveLength(9);
  });

  it("USD/JPY は Retail LONG / Large LONG で ALIGNED_LONG になる", async () => {
    const snapshot = await getSnapshotBySlug("usdjpy", "demo");
    expect(snapshot?.retail?.longPercent).toBe(68);
    expect(snapshot?.retail?.shortPercent).toBe(32);
    expect(snapshot?.alignment.largeBias).toBe("LONG");
    expect(snapshot?.alignment.status).toBe("ALIGNED_LONG");
  });

  it("EUR/USD は Retail LONG / Large SHORT で DIVERGENCE になる", async () => {
    const snapshot = await getSnapshotBySlug("eurusd", "demo");
    expect(snapshot?.retail?.longPercent).toBe(72);
    expect(snapshot?.alignment.largeBias).toBe("SHORT");
    expect(snapshot?.alignment.status).toBe("DIVERGENCE");
  });

  it("Large Trader を接続できていない銘柄は DATA_UNAVAILABLE", async () => {
    const snapshot = await getSnapshotBySlug("btcusd", "demo");
    expect(snapshot?.retail?.longPercent).toBe(58);
    expect(snapshot?.large).toBeNull();
    expect(snapshot?.largeReason).not.toBeNull();
    expect(snapshot?.alignment.status).toBe("DATA_UNAVAILABLE");
    expect(snapshot?.alignment.score).toBeNull();
  });

  it("Retail を接続できていない銘柄も DATA_UNAVAILABLE", async () => {
    const snapshot = await getSnapshotBySlug("jp225", "demo");
    expect(snapshot?.retail).toBeNull();
    expect(snapshot?.large).not.toBeNull();
    expect(snapshot?.alignment.status).toBe("DATA_UNAVAILABLE");
  });

  it("DEMO データには必ず demo フラグが立つ", async () => {
    const snapshots = await getAllSnapshots("demo");
    expect(snapshots.every((s) => s.demo)).toBe(true);
    for (const s of snapshots) {
      expect(s.retail?.meta.demo ?? true).toBe(true);
      expect(s.large?.meta.demo ?? true).toBe(true);
    }
  });

  it("MVP の 9 銘柄以外は表示しない", () => {
    expect(findMarket("audusd")).toBeUndefined();
    expect(findMarket("USDJPY")?.slug).toBe("usdjpy");
  });
});

describe("live モード", () => {
  it("未接続の Provider は値を作らず、理由を返す", async () => {
    const snapshot = await getSnapshotBySlug("usdjpy", "live");
    expect(snapshot?.retail).toBeNull();
    expect(snapshot?.large).toBeNull();
    expect(snapshot?.price).toBeNull();
    expect(snapshot?.demo).toBe(false);
    expect(snapshot?.alignment.status).toBe("DATA_UNAVAILABLE");
    expect(snapshot?.retailReason).toContain("OANDA");
    expect(snapshot?.largeReason).toContain("CFTC");
  });
});
