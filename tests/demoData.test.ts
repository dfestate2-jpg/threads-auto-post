import { describe, expect, it } from "vitest";
import { demoLargeTrader, demoPrice, demoRetail, latestCotDates } from "@/providers/mock/demoData";
import { MARKETS } from "@/lib/markets";

describe("latestCotDates", () => {
  it("直近の金曜公表と、その対象週 (火曜) を返す", () => {
    const { reportDate, releaseDate } = latestCotDates(new Date("2026-08-28T23:00:00.000Z"));
    expect(releaseDate.getUTCDay()).toBe(5); // Friday
    expect(reportDate.getUTCDay()).toBe(2); // Tuesday
    expect(releaseDate.getTime()).toBeGreaterThan(reportDate.getTime());
  });

  it("公表時刻前なら前週の金曜を返す", () => {
    const { releaseDate } = latestCotDates(new Date("2026-08-28T12:00:00.000Z"));
    expect(releaseDate.toISOString()).toBe("2026-08-21T19:30:00.000Z");
  });
});

describe("demo データの整合性", () => {
  const now = new Date("2026-08-28T23:00:00.000Z");

  it("Retail は Long + Short = 100 で、履歴が 48 点ある", () => {
    for (const market of MARKETS) {
      const retail = demoRetail(market.slug, now);
      if (!retail) continue;
      expect(retail.longPercent + retail.shortPercent).toBe(100);
      expect(retail.history).toHaveLength(48);
      expect(retail.history.every((p) => p.v >= 0 && p.v <= 100)).toBe(true);
      expect(retail.meta.demo).toBe(true);
    }
  });

  it("Large Trader は Net = Long - Short で、履歴の最後が最新週", () => {
    for (const market of MARKETS) {
      const large = demoLargeTrader(market.slug, now);
      if (!large) continue;
      expect(large.netPosition).toBe(large.longPosition - large.shortPosition);
      expect(large.history).toHaveLength(26);
      expect(large.history[large.history.length - 1].v).toBe(large.netPosition);
      expect(large.history[large.history.length - 2].v).toBe(large.previousNetPosition);
      expect(large.meta.cadence).toBe("weekly");
    }
  });

  it("同じ入力なら同じ履歴になる (描画のたびに形が変わらない)", () => {
    expect(demoRetail("usdjpy", now)?.history).toEqual(demoRetail("usdjpy", now)?.history);
    expect(demoPrice("xauusd", now)?.history).toEqual(demoPrice("xauusd", now)?.history);
  });

  it("定義のない銘柄には何も返さない", () => {
    expect(demoRetail("audusd", now)).toBeNull();
    expect(demoLargeTrader("audusd", now)).toBeNull();
    expect(demoPrice("audusd", now)).toBeNull();
  });
});
