/**
 * 優先順位エンジン。
 *
 * 「期限が近い順」ではなく、会社にとっての重さで並べ替えるための計算。
 * 期限・重要度・他タスクへの影響・売上インパクト・リスクを一つの点数にまとめ、
 * なぜその点になったかを必ず言葉で返す（点数だけ出しても経営者は納得できない）。
 *
 * ここは純粋関数だけで書いてある。将来 AI に置き換える／AIの補正値を足すときも、
 * 入力（TaskSignals）と出力（Scored）の形を保てば画面側は変えずに済む。
 */
import type { CoPriority, CoProjectStatus, CoTaskStatus } from '@prisma/client'

import { daysUntilDue } from './date'

/** 点数の算出に必要な情報。DB のモデルそのものではなく、必要な signal だけを受け取る */
export interface TaskSignals {
  id: string
  title: string
  status: CoTaskStatus
  priority: CoPriority
  dueOn: Date | null
  /** 0〜3。売上への影響 */
  revenueImpact: number
  /** 0〜3。放置したときのリスク */
  riskImpact: number
  /** このタスクの完了を待っている後続タスクの数 */
  blockingCount: number
  /** まだ完了していない先行タスクの数。1以上なら着手できない */
  blockedByCount: number
  project?: { status: CoProjectStatus; dueOn: Date | null; priority: CoPriority } | null
}

export type PriorityLevel = 'TOP' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface Scored {
  score: number
  level: PriorityLevel
  /** なぜこの順位なのか。画面にそのまま出す */
  reasons: string[]
  /** 先行タスク待ちで着手できない */
  blocked: boolean
  /** 期限超過日数（超過していなければ 0） */
  overdueDays: number
}

const PRIORITY_BASE: Record<CoPriority, number> = { TOP: 40, HIGH: 25, MEDIUM: 12, LOW: 4 }

/** 期限からの加点。超過は日を追うごとに重くする（ただし青天井にはしない） */
function dueScore(days: number | null): { score: number; reason: string | null } {
  if (days === null) return { score: 0, reason: null }
  if (days < 0) {
    const over = Math.min(-days, 10)
    return { score: 40 + over * 2, reason: `${-days}日超過` }
  }
  if (days === 0) return { score: 32, reason: '今日が期限' }
  if (days === 1) return { score: 24, reason: '明日が期限' }
  if (days <= 3) return { score: 16, reason: `期限まで${days}日` }
  if (days <= 7) return { score: 8, reason: '今週が期限' }
  if (days <= 14) return { score: 3, reason: null }
  return { score: 0, reason: null }
}

/**
 * 1件のタスクを採点する。
 * now を引数で受け取るのは、テストで時刻を固定できるようにするため。
 */
export function scoreTask(task: TaskSignals, now: Date, timezone?: string): Scored {
  const reasons: string[] = []

  // 完了・中止したものは並べ替えの対象外。0点にして必ず最後に落とす
  if (task.status === 'DONE' || task.status === 'CANCELED') {
    return { score: 0, level: 'LOW', reasons: [], blocked: false, overdueDays: 0 }
  }

  let score = PRIORITY_BASE[task.priority]
  if (task.priority === 'TOP') reasons.push('最優先に指定')

  const days = daysUntilDue(task.dueOn, now, timezone)
  const due = dueScore(days)
  score += due.score
  if (due.reason) reasons.push(due.reason)

  const revenue = clampImpact(task.revenueImpact)
  if (revenue > 0) {
    score += revenue * 6
    if (revenue >= 2) reasons.push(revenue === 3 ? '売上への影響が大きい' : '売上に影響する')
  }

  const risk = clampImpact(task.riskImpact)
  if (risk > 0) {
    score += risk * 6
    if (risk >= 2) reasons.push(risk === 3 ? '放置すると重大なリスク' : 'リスクがある')
  }

  // 他人の仕事を止めているタスクは、自分の期限より前に片付ける価値がある
  if (task.blockingCount > 0) {
    score += Math.min(task.blockingCount, 4) * 5
    reasons.push(`他の${task.blockingCount}件を止めている`)
  }

  if (task.project) {
    if (task.project.status === 'ACTIVE') score += 3
    if (task.project.priority === 'TOP') score += 5
    const projectDays = daysUntilDue(task.project.dueOn, now, timezone)
    if (projectDays !== null && projectDays < 0) {
      score += 5
      reasons.push('プロジェクトが遅延中')
    }
  }

  // 着手済みのものを先に終わらせる。並行して抱えるほど会社全体は遅くなる
  if (task.status === 'IN_PROGRESS') {
    score += 4
    reasons.push('着手済み')
  }
  if (task.status === 'REVIEW') score += 2
  if (task.status === 'ON_HOLD') score -= 20

  // 先行タスクが終わっていないものは、今日は手を付けられない
  const blocked = task.blockedByCount > 0
  if (blocked) {
    score = Math.round(score * 0.4)
    reasons.push(`先行タスク${task.blockedByCount}件の完了待ち`)
  }

  score = Math.max(0, Math.round(score))
  return {
    score,
    level: levelOf(score),
    reasons,
    blocked,
    overdueDays: days !== null && days < 0 ? -days : 0,
  }
}

function clampImpact(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(3, Math.max(0, Math.round(value)))
}

/** 点数を「最優先／高／中／低」に落とす。画面の色分けはこの4段階だけを見る */
export function levelOf(score: number): PriorityLevel {
  if (score >= 70) return 'TOP'
  if (score >= 45) return 'HIGH'
  if (score >= 22) return 'MEDIUM'
  return 'LOW'
}

export interface RankedTask<T> {
  task: T
  scored: Scored
}

/**
 * 採点して強い順に並べる。
 * 同点のときは期限が近い順 → タイトル順にして、開くたびに順番が変わらないようにする。
 */
export function rankTasks<T extends TaskSignals>(tasks: T[], now: Date, timezone?: string): RankedTask<T>[] {
  return tasks
    .map((task) => ({ task, scored: scoreTask(task, now, timezone) }))
    .sort((a, b) => {
      if (b.scored.score !== a.scored.score) return b.scored.score - a.scored.score
      const aDue = a.task.dueOn?.getTime() ?? Number.MAX_SAFE_INTEGER
      const bDue = b.task.dueOn?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (aDue !== bDue) return aDue - bDue
      return a.task.title.localeCompare(b.task.title, 'ja')
    })
}

/**
 * 「今日やるべきこと TOP N」。
 * 着手できない（先行待ち）タスクは、今日の行動としては提案しない。
 * ただし全部が先行待ちのときは、何も出さないほうが不親切なので埋め合わせる。
 */
export function pickTopTasks<T extends TaskSignals>(tasks: T[], now: Date, limit = 5, timezone?: string): RankedTask<T>[] {
  const ranked = rankTasks(tasks, now, timezone).filter((r) => r.scored.score > 0)
  const actionable = ranked.filter((r) => !r.scored.blocked)
  if (actionable.length >= limit) return actionable.slice(0, limit)
  const rest = ranked.filter((r) => r.scored.blocked)
  return [...actionable, ...rest].slice(0, limit)
}
