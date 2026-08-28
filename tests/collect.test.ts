import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import { collectRetailHistory } from "@/lib/collect";
import { InMemoryRetailHistoryStore } from "@/lib/history/memory";
import { GET } from "@/app/api/cron/collect/route";

describe("collectRetailHistory", () => {
  beforeEach(() => {
    clearCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        // OANDA だけ応答し、CFTC は落ちている状況を再現する
        if (url.includes("positionBook")) {
          return Response.json({
            positionBook: {
              time: "2026-08-28T12:00:00.000Z",
              buckets: [{ longCountPercent: "68", shortCountPercent: "32" }],
            },
          });
        }
        throw new Error("network disabled in tests");
      }),
    );
    vi.stubEnv("OANDA_API_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearCache();
  });

  it("取得できた銘柄を履歴に貯め、件数を返す", async () => {
    const store = new InMemoryRetailHistoryStore();
    const summary = await collectRetailHistory("live", store);

    expect(summary.mode).toBe("live");
    expect(summary.markets).toHaveLength(9);
    expect(summary.recorded).toBe(9);
    expect(summary.markets[0]).toMatchObject({ slug: "usdjpy", recorded: true, longPercent: 68 });

    const points = await store.since("usdjpy", new Date(0));
    expect(points).toEqual([{ t: "2026-08-28T12:00:00.000Z", longPercent: 68 }]);
  });

  it("DATABASE_URL が無いときは効果がないことを警告する", async () => {
    const summary = await collectRetailHistory("live", new InMemoryRetailHistoryStore());
    expect(summary.storage).toBe("memory");
    expect(summary.warning).toContain("DATABASE_URL");
  });

  it("demo モードでは実データを貯めない", async () => {
    const store = new InMemoryRetailHistoryStore();
    const summary = await collectRetailHistory("demo", store);

    expect(summary.recorded).toBe(0);
    expect(summary.warning).toContain("demo");
    expect(summary.markets[0].reason).toContain("DEMO");
    expect(await store.since("usdjpy", new Date(0))).toEqual([]);
  });

  it("取得できなかった銘柄は理由を残す", async () => {
    const store = new InMemoryRetailHistoryStore();
    vi.stubEnv("OANDA_API_TOKEN", "");
    clearCache();

    const summary = await collectRetailHistory("live", store);
    expect(summary.recorded).toBe(0);
    expect(summary.markets[0].reason).toContain("OANDA_API_TOKEN");
  });
});

describe("GET /api/cron/collect", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearCache();
  });

  const request = (token?: string) =>
    new Request("http://localhost/api/cron/collect", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it("CRON_SECRET が未設定なら受け付けない", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(request("whatever"));
    expect(response.status).toBe(503);
  });

  it("トークンが違えば 401", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    expect((await GET(request("wrong-secret"))).status).toBe(401);
    expect((await GET(request("correct-secret-longer"))).status).toBe(401);
    expect((await GET(request())).status).toBe(401); // ヘッダなし
  });

  it("トークンが合っていれば結果を返す", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.markets).toHaveLength(9);
    expect(body.mode).toBe("demo");
  });
});
