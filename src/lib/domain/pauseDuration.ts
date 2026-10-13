import { endOfDayIn } from './time'

/**
 * 期限付き停止の上限。
 *
 * これ以上は「いつ戻るか決まっていない」停止なので、期限付きではなく
 * 無期限（`indefinite`）で止めるべき。どちらも画面に警告を出し続ける。
 */
export const MAX_PAUSE_MINUTES = 24 * 60

export type PauseRequest =
  /** 指定した分だけ止める。0 以下は再開として扱う */
  | { kind: 'minutes'; minutes: number }
  /** 「今日いっぱい」＝タイムゾーン基準のその日の終わりまで */
  | { kind: 'endOfDay' }
  /** 「再開」を押すまで止めたまま */
  | { kind: 'indefinite' }
  /** 今すぐ再開 */
  | { kind: 'resume' }

export interface PauseState {
  /** 期限付き停止の期限。null = 期限付きでは止めていない */
  until: Date | null
  /** 期限を決めない停止 */
  indefinite: boolean
}

/**
 * 停止の状態を決める。
 *
 * 期限付きと無期限は**同時に立てない**。片方を選んだらもう片方を必ず畳む。
 * 両方が立つと「期限が切れたのに止まったまま」「期限内なのに無期限表示」
 * のような、画面とふるまいが食い違う状態が生まれる。
 */
export function resolvePause(req: PauseRequest, timezone: string, now: Date): PauseState {
  if (req.kind === 'resume') return { until: null, indefinite: false }
  if (req.kind === 'indefinite') return { until: null, indefinite: true }

  const cap = new Date(now.getTime() + MAX_PAUSE_MINUTES * 60_000)

  if (req.kind === 'minutes') {
    if (req.minutes <= 0) return { until: null, indefinite: false }
    const until = new Date(now.getTime() + Math.min(req.minutes, MAX_PAUSE_MINUTES) * 60_000)
    return { until, indefinite: false }
  }

  // 深夜に押したときは「今日いっぱい」が数分しか残っていない。
  // それでは押した意味がないので、最低1時間は止まるようにする
  const endOfDay = endOfDayIn(timezone, now)
  const floor = new Date(now.getTime() + 60 * 60_000)
  const candidate = endOfDay.getTime() < floor.getTime() ? floor : endOfDay
  return { until: candidate.getTime() > cap.getTime() ? cap : candidate, indefinite: false }
}

/** いま停止中か。画面の警告とジョブの入口で同じ判定を使う */
export function isPaused(state: PauseState, now: Date): boolean {
  if (state.indefinite) return true
  return state.until !== null && state.until.getTime() > now.getTime()
}
