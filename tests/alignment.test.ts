import { describe, expect, it } from "vitest";
import {
  alignmentScore,
  evaluateAlignment,
  largeBias,
  largeMomentum,
  netPercent,
  retailBias,
} from "@/lib/alignment";
import type { LargeTraderPosition, RetailSentiment } from "@/providers/types";

function retail(longPercent: number): RetailSentiment {
  return {
    longPercent,
    shortPercent: 100 - longPercent,
    change1h: 0,
    change24h: 0,
    history: [],
    meta: { source: "TEST", updatedAt: "2026-08-28T00:00:00.000Z", cadence: "hourly", demo: true },
  };
}

function large(long: number, short: number, prevNet: number | null = null): LargeTraderPosition {
  return {
    longPosition: long,
    shortPosition: short,
    netPosition: long - short,
    previousNetPosition: prevNet,
    history: [],
    traderCategory: "Leveraged Funds",
    meta: { source: "TEST", updatedAt: "2026-08-28T00:00:00.000Z", cadence: "weekly", demo: true },
  };
}

describe("retailBias", () => {
  it("55% 以上で LONG、45% 以下で SHORT、その間は NEUTRAL", () => {
    expect(retailBias(retail(68))).toBe("LONG");
    expect(retailBias(retail(55))).toBe("LONG");
    expect(retailBias(retail(54))).toBe("NEUTRAL");
    expect(retailBias(retail(50))).toBe("NEUTRAL");
    expect(retailBias(retail(45))).toBe("SHORT");
    expect(retailBias(retail(32))).toBe("SHORT");
  });
});

describe("largeBias", () => {
  it("Net が総建玉の 5% を超えたら方向ありとみなす", () => {
    expect(largeBias(large(120_000, 80_000))).toBe("LONG");
    expect(largeBias(large(80_000, 120_000))).toBe("SHORT");
    expect(largeBias(large(100_000, 98_000))).toBe("NEUTRAL");
  });

  it("建玉が空でも落ちない", () => {
    expect(netPercent(large(0, 0))).toBe(0);
    expect(largeBias(large(0, 0))).toBe("NEUTRAL");
  });
});

describe("largeMomentum", () => {
  it("前週比で Net が増えていれば UP、減っていれば DOWN", () => {
    expect(largeMomentum(large(120_000, 80_000, 30_000))).toBe("UP");
    expect(largeMomentum(large(120_000, 80_000, 60_000))).toBe("DOWN");
    expect(largeMomentum(large(120_000, 80_000, 40_500))).toBe("FLAT");
  });

  it("前週データがなければ null", () => {
    expect(largeMomentum(large(120_000, 80_000, null))).toBeNull();
    expect(largeMomentum(large(120_000, 80_000, 0))).toBeNull();
  });
});

describe("evaluateAlignment", () => {
  it("同方向なら ALIGNED、逆方向なら DIVERGENCE", () => {
    expect(evaluateAlignment({ retail: retail(68), large: large(120_000, 80_000), priceTrend: "UP" }).status).toBe(
      "ALIGNED_LONG",
    );
    expect(evaluateAlignment({ retail: retail(32), large: large(80_000, 120_000), priceTrend: "DOWN" }).status).toBe(
      "ALIGNED_SHORT",
    );
    expect(evaluateAlignment({ retail: retail(72), large: large(96_500, 148_200), priceTrend: "DOWN" }).status).toBe(
      "DIVERGENCE",
    );
    expect(evaluateAlignment({ retail: retail(30), large: large(120_000, 80_000), priceTrend: "UP" }).status).toBe(
      "DIVERGENCE",
    );
  });

  it("どちらかが中立なら NEUTRAL", () => {
    expect(evaluateAlignment({ retail: retail(51), large: large(120_000, 80_000), priceTrend: "UP" }).status).toBe(
      "NEUTRAL",
    );
  });

  it("データが欠けていれば DATA_UNAVAILABLE でスコアは出さない", () => {
    const result = evaluateAlignment({ retail: retail(58), large: null, priceTrend: "UP" });
    expect(result.status).toBe("DATA_UNAVAILABLE");
    expect(result.score).toBeNull();
    expect(result.retailBias).toBe("LONG");
    expect(result.largeBias).toBeNull();
  });
});

describe("alignmentScore", () => {
  it("Retail LONG / Large LONG / 積み増し / 価格上昇 で 80 前後になる", () => {
    const score = alignmentScore({
      retail: retail(70),
      large: large(120_000, 80_000, 32_000),
      priceTrend: "UP",
    });
    expect(score).toBeGreaterThanOrEqual(75);
    expect(score).toBeLessThanOrEqual(87);
  });

  it("逆方向なら 50 を大きく下回る", () => {
    const score = alignmentScore({
      retail: retail(72),
      large: large(96_500, 148_200, -38_000),
      priceTrend: "DOWN",
    });
    expect(score).toBeLessThan(35);
  });

  it("中立なら 50 のまま", () => {
    expect(alignmentScore({ retail: retail(52), large: large(120_000, 80_000, 30_000), priceTrend: "UP" })).toBe(50);
  });

  it("常に 0-100 の範囲に収まる", () => {
    const extremeHigh = alignmentScore({
      retail: retail(95),
      large: large(300_000, 1_000, 1_000),
      priceTrend: "UP",
    });
    const extremeLow = alignmentScore({
      retail: retail(95),
      large: large(1_000, 300_000, -1_000),
      priceTrend: "DOWN",
    });
    expect(extremeHigh).toBeLessThanOrEqual(100);
    expect(extremeLow).toBeGreaterThanOrEqual(0);
  });
});
