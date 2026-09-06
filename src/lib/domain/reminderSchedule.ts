import { addBusinessMinutes, nextBusinessInstant, type BusinessCalendar } from './businessHours'
import { addMinutes } from './time'

export type ScheduleKind = 'ROUTINE' | 'GUARD' | 'ESCALATION'

export interface SchedulePolicy {
  /** 解決済みのリマインド間隔（分）。0 以下 = 通知しない */
  intervalMinutes: number
  /**
   * 回を追うごとに間隔を倍にしていくか。
   * LINEの通数は「送信回数 × 届いた人数」で課金され、ライトプランは
   * 上限を超えると **送信そのものができなくなる**（＝リマインドが止まる）。
   * 同じ内容を1時間ごとに鳴らし続けるより、間隔を空けて長く鳴らし続けるほうが、
   * 見逃さないという目的に対して通数あたりの効果が高い。
   */
  backoffEnabled?: boolean
  /** バックオフの上限（分）。これ以上は間隔を広げない。0 以下 = 上限なし */
  maxIntervalMinutes?: number
  /** 初回リマインドまでの待ち時間（分） */
  firstDelayMinutes: number
  /** 1サイクルの最大通知回数。0 = 無制限 */
  maxRemindersPerCycle: number
  /** 返信されない限りこの分数以上は無通知にしない保険。0 = 無効 */
  maxSilenceGuardMinutes: number
  respectBusinessHours: boolean
  countBusinessHoursOnly: boolean
  calendar: BusinessCalendar
  /**
   * エスカレーション閾値（分）の一覧。
   * 通常のリマインド間隔より早い段階があれば、その時刻まで通知を前倒しする。
   * 例: 間隔3時間・エスカレーション1時間 のとき、1時間で必ず通知が出る。
   */
  escalationThresholdsMinutes?: number[]
}

export interface ScheduleState {
  /** 【仕様①】最新の顧客メッセージ時刻。追加メッセージでリセットされるカウント起点 */
  awaitingSince: Date
  /** 直近の返信以降で最初に届いた未返信メッセージ時刻（リセットされない） */
  firstUnrepliedAt: Date
  /** この未返信サイクルで既に送った通知回数 */
  reminderCount: number
  lastReminderAt: Date | null
  /** 既に発火済みのエスカレーション段階（分）。これ以下の閾値は再スケジュールしない */
  escalationLevel?: number
}

export type ScheduleReason =
  | 'NOTIFICATION_DISABLED'
  | 'MAX_REMINDERS_REACHED'
  | 'FIRST_REMINDER'
  | 'INTERVAL'
  | 'SILENCE_GUARD'
  | 'ESCALATION'

export interface ScheduleResult {
  /** 次回リマインド時刻。null = 送らない */
  nextReminderAt: Date | null
  kind: ScheduleKind
  reason: ScheduleReason
}

/**
 * 顧客ごとの上書き設定と全体設定から、実際に使うリマインド間隔を決定する。
 * null / undefined = 全体設定に従う、0 = 通知しない。
 */
export function resolveIntervalMinutes(
  customerOverrideMinutes: number | null | undefined,
  defaultMinutes: number,
): number {
  if (customerOverrideMinutes === null || customerOverrideMinutes === undefined) return defaultMinutes
  return customerOverrideMinutes
}

/** バックオフの倍率。2 = 1回鳴るごとに間隔が倍になる */
const BACKOFF_FACTOR = 2

/**
 * 「次の1通」までの間隔を求める。
 *
 * バックオフ有効時は、既に鳴らした回数だけ間隔を倍にしていく。
 * 例（基準1時間・上限8時間）: 1h → 2h → 4h → 8h → 8h → …
 * 顧客のメッセージから見た通知時刻は 1h, 2h, 4h, 8h, 16h… となり、
 * 営業時間内に丸1日残った案件の通数が 11通 から 4通 程度まで落ちる。
 *
 * **エスカレーション（1時間・3時間・6時間）はこの影響を受けない。**
 * あちらは経過時間そのものが閾値なので、間隔を広げても定刻どおりに発火する。
 * 薄くなるのは「同じ内容の繰り返し」だけで、段階が上がる通知は従来どおり届く。
 */
export function effectiveIntervalMinutes(policy: SchedulePolicy, reminderCount: number): number {
  if (!policy.backoffEnabled || reminderCount <= 1) return policy.intervalMinutes

  const cap = policy.maxIntervalMinutes && policy.maxIntervalMinutes > 0 ? policy.maxIntervalMinutes : Infinity
  const grown = policy.intervalMinutes * BACKOFF_FACTOR ** (reminderCount - 1)
  // 指数は簡単に跳ね上がるので、必ず上限で頭を押さえる
  return Math.min(grown, Math.max(cap, policy.intervalMinutes))
}

function advance(base: Date, minutes: number, policy: SchedulePolicy): Date {
  if (policy.countBusinessHoursOnly) return addBusinessMinutes(base, minutes, policy.calendar)
  return addMinutes(base, minutes)
}

/**
 * 次回リマインド時刻を決定する。副作用なし・テスト可能な純粋関数。
 *
 * 決定則:
 *  1. 通知OFF、または上限到達 → null
 *  2. 「最新顧客メッセージ + 初回待ち」と「前回通知 + 間隔」の **遅い方** を基本とする。
 *     - 顧客が追加メッセージを送ると前者が後ろへ動く = 仕様①のカウント再スタート
 *     - 通知直後に前者が過去でも、後者により最低でも間隔分は空く = 連打防止
 *  3. 保険（SILENCE_GUARD）: 返信が無いまま maxSilenceGuardMinutes を超える無通知区間を作らない。
 *     顧客が間隔未満で連投し続けても、必ず一定間隔で通知が出る。
 *  4. 営業時間を尊重する場合、算出時刻を次の営業開始時刻へ **繰り延べる**（スキップしない）。
 */
export function computeNextReminderAt(state: ScheduleState, policy: SchedulePolicy): ScheduleResult {
  if (policy.intervalMinutes <= 0) {
    return { nextReminderAt: null, kind: 'ROUTINE', reason: 'NOTIFICATION_DISABLED' }
  }
  if (policy.maxRemindersPerCycle > 0 && state.reminderCount >= policy.maxRemindersPerCycle) {
    return { nextReminderAt: null, kind: 'ROUTINE', reason: 'MAX_REMINDERS_REACHED' }
  }

  const interval = effectiveIntervalMinutes(policy, state.reminderCount)
  const fromAwaiting = advance(state.awaitingSince, policy.firstDelayMinutes, policy)
  const fromLast = state.lastReminderAt ? advance(state.lastReminderAt, interval, policy) : null

  let candidate = fromAwaiting
  let kind: ScheduleKind = 'ROUTINE'
  let reason: ScheduleReason = state.lastReminderAt ? 'INTERVAL' : 'FIRST_REMINDER'

  if (fromLast && fromLast.getTime() > candidate.getTime()) {
    candidate = fromLast
    reason = 'INTERVAL'
  }

  const pendingThreshold = (policy.escalationThresholdsMinutes ?? [])
    .filter((t) => t > (state.escalationLevel ?? 0))
    .sort((a, b) => a - b)[0]
  if (pendingThreshold !== undefined) {
    const escalationAt = advance(state.firstUnrepliedAt, pendingThreshold, policy)
    if (escalationAt.getTime() < candidate.getTime()) {
      candidate = escalationAt
      kind = 'ESCALATION'
      reason = 'ESCALATION'
    }
  }

  if (policy.maxSilenceGuardMinutes > 0) {
    const guardBase = state.lastReminderAt ?? state.firstUnrepliedAt
    /**
     * 保険が守るのは「顧客の連投で起点が後ろへ動き続け、いつまでも鳴らない」ことであって、
     * **意図して広げた間隔を縮めることではない。**
     * 上限をそのまま当てると保険がバックオフを打ち消す
     * （上限3時間なら、間隔を8時間に広げても3時間で鳴ってしまう）。
     *
     * そこで **バックオフ有効時に限り**、「上限」と「今の間隔」の長いほうを
     * 無通知の許容幅とする。バックオフを使っていない設定の挙動は一切変えない。
     */
    const guardMinutes = policy.backoffEnabled
      ? Math.max(policy.maxSilenceGuardMinutes, interval)
      : policy.maxSilenceGuardMinutes
    const guardAt = advance(guardBase, guardMinutes, policy)
    if (guardAt.getTime() < candidate.getTime()) {
      candidate = guardAt
      kind = 'GUARD'
      reason = 'SILENCE_GUARD'
    }
  }

  if (policy.respectBusinessHours) {
    candidate = nextBusinessInstant(candidate, policy.calendar)
  }

  return { nextReminderAt: candidate, kind, reason }
}

/**
 * 未返信かどうかの判定。【仕様①】
 * 顧客からの最新メッセージ > 担当者からの最新返信 なら未返信。
 */
export function isAwaitingReply(lastInboundAt: Date | null, lastOutboundAt: Date | null): boolean {
  if (!lastInboundAt) return false
  if (!lastOutboundAt) return true
  return lastInboundAt.getTime() > lastOutboundAt.getTime()
}
