/**
 * Retail の履歴を貯める層。
 *
 * OANDA の Position Book は「今この瞬間の比率」しか返さないため、
 * 1h / 24h 変化と推移チャートは自分で貯めるしかない。
 * 保存先を差し替えられるように、必要最小限のインターフェースだけ置く。
 */

export interface RetailPoint {
  /** 観測時刻 (ISO 8601)。Provider が返したデータ時刻をそのまま使う */
  t: string;
  longPercent: number;
}

export interface RetailHistoryStore {
  /** 同じ提供元・同じ観測時刻の点は二重に持たない */
  record(slug: string, provider: string, point: RetailPoint): Promise<void>;
  /** since 以降の点を古い順で返す */
  since(slug: string, since: Date): Promise<RetailPoint[]>;
}

/**
 * 最新の観測から windowMs だけ遡った時点と比べた変化量 (ポイント)。
 *
 * 基準は壁時計ではなく「最新の観測時刻」に合わせる。壁時計を基準にすると、
 * データ自体が古いときに最新点どうしを比べて「変化 0」と出てしまうため。
 * 遡った時点より古い点が無ければ null を返す (まだ貯まっていない、を
 * 0 や推測で埋めない)。
 */
export function changeOver(points: RetailPoint[], windowMs: number): number | null {
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const cutoff = new Date(latest.t).getTime() - windowMs;

  // cutoff 以前で最も新しい点を基準にする
  let reference: RetailPoint | null = null;
  for (const point of points) {
    if (new Date(point.t).getTime() <= cutoff) reference = point;
    else break;
  }
  if (!reference || reference.t === latest.t) return null;

  return Math.round((latest.longPercent - reference.longPercent) * 10) / 10;
}
