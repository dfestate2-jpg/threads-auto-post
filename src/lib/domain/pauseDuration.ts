import { endOfDayIn } from './time'

/**
 * 止めすぎの歯止め。
 *
 * これ以上（数日単位）止めたいのは「臨時休業」であって「一時停止」ではない。
 * 休業なら営業日の設定で表現すべきで、そちらは期限を忘れても勝手に元に戻る。
 */
export const MAX_PAUSE_MINUTES = 24 * 60

/** 「今日いっぱい」＝タイムゾーン基準のその日の終わりまで */
export type PauseRequest = { kind: 'minutes'; minutes: number } | { kind: 'endOfDay' }

/**
 * 停止の期限を決める。`null` は「再開」。
 *
 * **どの長さを選んでも必ず期限が付く。** 無期限に止められると、
 * 止めたことを忘れた時点で「未返信を見逃さない」という仕組みそのものが静かに死ぬ。
 */
export function resolvePauseUntil(req: PauseRequest, timezone: string, now: Date): Date | null {
  const cap = new Date(now.getTime() + MAX_PAUSE_MINUTES * 60_000)

  if (req.kind === 'minutes') {
    if (req.minutes <= 0) return null
    return new Date(now.getTime() + Math.min(req.minutes, MAX_PAUSE_MINUTES) * 60_000)
  }

  // 深夜に押したときは「今日いっぱい」が数分しか残っていない。
  // それでは押した意味がないので、最低1時間は止まるようにする
  const endOfDay = endOfDayIn(timezone, now)
  const floor = new Date(now.getTime() + 60 * 60_000)
  const until = endOfDay.getTime() < floor.getTime() ? floor : endOfDay
  return until.getTime() > cap.getTime() ? cap : until
}
