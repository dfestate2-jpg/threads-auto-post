/**
 * DEMO DATA。
 *
 * 実データが接続されるまでの UI 確認用。ここで作った値は必ず
 * meta.demo = true を持ち、UI 側に「DEMO DATA」と表示される。
 * 実データとして扱ってはならない。
 */

import type {
  LargeTraderPosition,
  MarketPrice,
  RetailSentiment,
  SeriesPoint,
} from "@/providers/types";

interface DemoSpec {
  /** Retail の現在の Long%。null なら Retail データなし */
  retailLong: number | null;
  /** Large Trader の建玉。null ならデータなし */
  large: { long: number; short: number; prevNet: number; category: string } | null;
  price: number | null;
  /** 価格の 24 時間変化率 (%) */
  priceChange: number;
}

/**
 * 銘柄ごとの DEMO 値。
 * BTC / 日経は「Retail や Large のデータが必ずしも揃わない」ケースを
 * UI で確認するために、意図的に欠損させてある。
 */
const DEMO: Record<string, DemoSpec> = {
  usdjpy: {
    retailLong: 68,
    large: { long: 121_400, short: 78_900, prevNet: 37_800, category: "Leveraged Funds" },
    price: 159.42,
    priceChange: 0.34,
  },
  eurjpy: {
    retailLong: 61,
    large: { long: 64_200, short: 51_300, prevNet: 15_900, category: "Leveraged Funds" },
    price: 172.18,
    priceChange: 0.12,
  },
  gbpjpy: {
    retailLong: 47,
    large: { long: 58_700, short: 55_100, prevNet: 2_100, category: "Leveraged Funds" },
    price: 202.55,
    priceChange: -0.08,
  },
  eurusd: {
    retailLong: 72,
    large: { long: 96_500, short: 148_200, prevNet: -44_800, category: "Leveraged Funds" },
    price: 1.0842,
    priceChange: -0.21,
  },
  gbpusd: {
    retailLong: 38,
    large: { long: 61_300, short: 92_700, prevNet: -27_500, category: "Leveraged Funds" },
    price: 1.2714,
    priceChange: -0.17,
  },
  xauusd: {
    retailLong: 67,
    large: { long: 214_800, short: 96_400, prevNet: 104_900, category: "Managed Money" },
    price: 2418.6,
    priceChange: 0.62,
  },
  btcusd: {
    // Retail はあるが、Large Trader 側を接続できていない銘柄の例
    retailLong: 58,
    large: null,
    price: 63_180,
    priceChange: 1.44,
  },
  jp225: {
    // Retail Sentiment の提供元がない銘柄の例
    retailLong: null,
    large: { long: 38_900, short: 33_400, prevNet: 6_800, category: "Asset Manager" },
    price: 38_640,
    priceChange: 0.28,
  },
  nas100: {
    retailLong: 41,
    large: { long: 47_600, short: 39_800, prevNet: 6_200, category: "Leveraged Funds" },
    price: 19_820,
    priceChange: -0.44,
  },
};

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

/** 文字列から決定的な擬似乱数列を作る (同じ銘柄なら毎回同じ形の履歴になる) */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** end で終わる、ゆるやかに揺れる系列を作る */
function walkTo(seed: string, end: number, points: number, amplitude: number): number[] {
  const rand = rng(seed);
  const raw: number[] = [];
  let v = 0;
  for (let i = 0; i < points; i += 1) {
    v += (rand() - 0.5) * amplitude;
    v *= 0.86; // 平均回帰させて発散を防ぐ
    raw.push(v);
  }
  const drift = raw[raw.length - 1];
  return raw.map((r) => end + (r - drift));
}

function series(values: number[], stepMs: number, endAt: number, round: (v: number) => number): SeriesPoint[] {
  const n = values.length;
  return values.map((v, i) => ({
    t: new Date(endAt - (n - 1 - i) * stepMs).toISOString(),
    v: round(v),
  }));
}

/** 直近の CFTC レポート公表日 (毎週金曜) と、その対象となる火曜日 */
export function latestCotDates(now: Date): { reportDate: Date; releaseDate: Date } {
  const release = new Date(now);
  release.setUTCHours(19, 30, 0, 0); // 15:30 ET ≒ 19:30 UTC
  while (release.getUTCDay() !== 5 || release.getTime() > now.getTime()) {
    release.setUTCDate(release.getUTCDate() - 1);
  }
  const report = new Date(release.getTime() - 3 * 24 * HOUR); // 金曜公表 → 対象は火曜
  return { reportDate: report, releaseDate: release };
}

export function demoRetail(slug: string, now = new Date()): RetailSentiment | null {
  const spec = DEMO[slug];
  if (!spec || spec.retailLong === null) return null;

  const endAt = Math.floor(now.getTime() / HOUR) * HOUR;
  const values = walkTo(`${slug}:retail`, spec.retailLong, 48, 3.2).map((v) =>
    Math.min(92, Math.max(8, v)),
  );
  const history = series(values, HOUR, endAt, (v) => Math.round(v * 10) / 10);
  const long = Math.round(spec.retailLong);
  const last = history[history.length - 1].v;

  return {
    longPercent: long,
    shortPercent: 100 - long,
    change1h: round1(last - history[history.length - 2].v),
    change24h: round1(last - history[history.length - 25].v),
    history,
    meta: {
      source: "Mock Provider",
      updatedAt: new Date(now.getTime() - 42_000).toISOString(),
      cadence: "hourly",
      demo: true,
    },
  };
}

export function demoLargeTrader(slug: string, now = new Date()): LargeTraderPosition | null {
  const spec = DEMO[slug];
  if (!spec || !spec.large) return null;

  const { reportDate, releaseDate } = latestCotDates(now);
  const net = spec.large.long - spec.large.short;
  const values = walkTo(`${slug}:large`, net, 26, Math.max(4_000, Math.abs(net) * 0.35));
  const history = series(values.slice(0, -2), WEEK, reportDate.getTime() - 2 * WEEK, Math.round);
  history.push({ t: new Date(reportDate.getTime() - WEEK).toISOString(), v: spec.large.prevNet });
  history.push({ t: reportDate.toISOString(), v: net });

  return {
    longPosition: spec.large.long,
    shortPosition: spec.large.short,
    netPosition: net,
    previousNetPosition: spec.large.prevNet,
    history,
    traderCategory: spec.large.category,
    meta: {
      source: "Mock Provider",
      updatedAt: releaseDate.toISOString(),
      cadence: "weekly",
      demo: true,
    },
  };
}

export function demoPrice(slug: string, now = new Date()): MarketPrice | null {
  const spec = DEMO[slug];
  if (!spec || spec.price === null) return null;

  const endAt = Math.floor(now.getTime() / HOUR) * HOUR;
  const values = walkTo(`${slug}:price`, spec.price, 72, spec.price * 0.004);
  const history = series(values, HOUR, endAt, (v) => Number(v.toFixed(6)));

  return {
    price: spec.price,
    change24hPercent: spec.priceChange,
    history,
    meta: {
      source: "Mock Provider",
      updatedAt: new Date(now.getTime() - 8_000).toISOString(),
      cadence: "realtime",
      demo: true,
    },
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
