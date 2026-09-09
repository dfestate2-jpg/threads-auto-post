/**
 * OANDA Position Book のレスポンス解析。
 *
 * fetch と切り離した純粋な関数にしてある (ネットワークなしでテストするため)。
 *
 * Position Book は価格帯ごとのバケットに分かれており、各バケットは
 *   longCountPercent  … そのバケットの Long が全ポジションに占める割合
 *   shortCountPercent … 同じく Short
 * を持つ。全バケットを合計すると Long + Short で 100% になる想定。
 *
 * ここが想定と違った場合 (片側ずつ 100% に正規化されている等) は、
 * 常に 50/50 になってしまい実データとして誤りなので、値を作らずエラーを返す。
 */

export interface PositionBookBucket {
  price?: string;
  longCountPercent?: string;
  shortCountPercent?: string;
}

export interface PositionBookResponse {
  positionBook?: {
    instrument?: string;
    time?: string;
    unixTime?: string;
    bucketWidth?: string;
    buckets?: PositionBookBucket[];
  };
}

export type ParsedPositionBook =
  | { ok: true; longPercent: number; shortPercent: number; time: string }
  | { ok: false; reason: string };

/** 合計が 100% からこれ以上ずれていたら、想定と違う形式とみなす */
const TOTAL_TOLERANCE = 5;

export function parsePositionBook(body: PositionBookResponse): ParsedPositionBook {
  const book = body.positionBook;
  if (!book) return { ok: false, reason: "positionBook がレスポンスに含まれていない" };

  const buckets = book.buckets ?? [];
  if (buckets.length === 0) return { ok: false, reason: "positionBook の buckets が空" };

  let sumLong = 0;
  let sumShort = 0;
  for (const bucket of buckets) {
    const long = Number(bucket.longCountPercent);
    const short = Number(bucket.shortCountPercent);
    if (!Number.isFinite(long) || !Number.isFinite(short)) {
      return { ok: false, reason: "buckets に数値として読めない値が含まれている" };
    }
    sumLong += long;
    sumShort += short;
  }

  const total = sumLong + sumShort;
  if (Math.abs(total - 100) > TOTAL_TOLERANCE) {
    return {
      ok: false,
      reason: `Long+Short の合計が ${total.toFixed(1)}% で想定 (100%) と異なるため、比率として扱えない`,
    };
  }

  const longPercent = Math.round((sumLong / total) * 100);
  const time = book.time ?? (book.unixTime ? new Date(Number(book.unixTime) * 1000).toISOString() : null);
  if (!time) return { ok: false, reason: "positionBook にデータ時刻が含まれていない" };

  return {
    ok: true,
    longPercent,
    shortPercent: 100 - longPercent,
    time: new Date(time).toISOString(),
  };
}
