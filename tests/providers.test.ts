import { describe, expect, it } from "vitest";
import { parsePositionBook } from "@/providers/oanda/positionBook";
import {
  DISAGGREGATED_MANAGED_MONEY,
  TFF_LEVERAGED_FUNDS,
  parseCotRows,
} from "@/providers/cftc/cot";

describe("OANDA Position Book の解析", () => {
  const book = (buckets: { longCountPercent: string; shortCountPercent: string }[]) => ({
    positionBook: {
      instrument: "USD_JPY",
      time: "2026-08-28T17:00:00.000000000Z",
      bucketWidth: "0.050",
      buckets: buckets.map((b, i) => ({ price: String(150 + i), ...b })),
    },
  });

  it("全バケットを合計して Long / Short 比率を出す", () => {
    const parsed = parsePositionBook(
      book([
        { longCountPercent: "20.0", shortCountPercent: "10.0" },
        { longCountPercent: "30.0", shortCountPercent: "12.0" },
        { longCountPercent: "18.0", shortCountPercent: "10.0" },
      ]),
    );
    expect(parsed).toEqual({
      ok: true,
      longPercent: 68,
      shortPercent: 32,
      time: "2026-08-28T17:00:00.000Z",
    });
  });

  it("片側ずつ 100% に正規化されている形式なら、値を作らず理由を返す", () => {
    // この形式で合計してしまうと常に 50/50 になり、実データとして誤りになる
    const parsed = parsePositionBook(
      book([
        { longCountPercent: "60.0", shortCountPercent: "55.0" },
        { longCountPercent: "40.0", shortCountPercent: "45.0" },
      ]),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("200.0%");
  });

  it("buckets が空・数値でない・時刻がない場合はエラーにする", () => {
    expect(parsePositionBook({ positionBook: { time: "2026-08-28T17:00:00Z", buckets: [] } }).ok).toBe(false);
    expect(parsePositionBook({}).ok).toBe(false);
    expect(
      parsePositionBook(book([{ longCountPercent: "n/a", shortCountPercent: "10.0" }])).ok,
    ).toBe(false);
    expect(
      parsePositionBook({
        positionBook: { buckets: [{ longCountPercent: "60", shortCountPercent: "40" }] },
      }).ok,
    ).toBe(false);
  });

  it("time が無くても unixTime があれば使える", () => {
    const parsed = parsePositionBook({
      positionBook: {
        unixTime: "1787936400",
        buckets: [{ longCountPercent: "60", shortCountPercent: "40" }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.longPercent).toBe(60);
  });
});

describe("CFTC 建玉報告の解析", () => {
  const rows = [
    { report_date_as_yyyy_mm_dd: "2026-08-25T00:00:00.000", lev_money_positions_long: "121400", lev_money_positions_short: "78900" },
    { report_date_as_yyyy_mm_dd: "2026-08-18T00:00:00.000", lev_money_positions_long: "115200", lev_money_positions_short: "77400" },
    { report_date_as_yyyy_mm_dd: "2026-08-11T00:00:00.000", lev_money_positions_long: "108900", lev_money_positions_short: "80100" },
  ];

  it("新しい順のレスポンスを古い順の週次データに直し、Net を計算する", () => {
    const parsed = parseCotRows(rows, TFF_LEVERAGED_FUNDS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.weeks).toHaveLength(3);
    expect(parsed.weeks[0].reportDate).toBe("2026-08-11T00:00:00.000Z");
    expect(parsed.weeks[2].reportDate).toBe("2026-08-25T00:00:00.000Z");
    expect(parsed.weeks[2].netPosition).toBe(42_500);
    expect(parsed.weeks[1].netPosition).toBe(37_800);
  });

  it("フィールド名が想定と違えば、どのフィールドが読めないかを返す", () => {
    // Disaggregated のフィールド名で TFF のレスポンスを読もうとしたケース
    const parsed = parseCotRows(rows, DISAGGREGATED_MANAGED_MONEY);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("m_money_positions_long_all");
  });

  it("行が 0 件ならエラーにする (空の建玉として扱わない)", () => {
    const parsed = parseCotRows([], TFF_LEVERAGED_FUNDS);
    expect(parsed.ok).toBe(false);
  });

  it("報告日が無い行はエラーにする", () => {
    const parsed = parseCotRows(
      [{ lev_money_positions_long: "1", lev_money_positions_short: "2" }],
      TFF_LEVERAGED_FUNDS,
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("report_date_as_yyyy_mm_dd");
  });
});
