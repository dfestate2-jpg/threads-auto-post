/**
 * 進捗と遅延の判定。
 *
 * 「進行中」と書いてあるだけでは、遅れているかどうかは分からない。
 * 完了率と残り日数を突き合わせて、遅れを機械的に検出する。
 */
import type { CoProjectStatus, CoTaskStatus } from '@prisma/client'

import { daysUntilDue } from './date'

export interface Progress {
  done: number
  total: number
  percent: number
}

/** 中止したタスクは母数から外す。数えると「やらないと決めたこと」で進捗が下がる */
export function taskProgress(statuses: CoTaskStatus[], override?: number | null): Progress {
  const counted = statuses.filter((s) => s !== 'CANCELED')
  const done = counted.filter((s) => s === 'DONE').length
  const total = counted.length
  const natural = total === 0 ? 0 : Math.round((done / total) * 100)
  const percent = override === null || override === undefined ? natural : clampPercent(override)
  return { done, total, percent }
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

export type ProjectHealth = 'DONE' | 'DELAYED' | 'AT_RISK' | 'ON_TRACK' | 'IDLE'

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  DONE: '完了',
  DELAYED: '遅延',
  AT_RISK: '注意',
  ON_TRACK: '順調',
  IDLE: '未着手',
}

export const HEALTH_CLASS: Record<ProjectHealth, string> = {
  DONE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  DELAYED: 'bg-red-100 text-red-800 border-red-200',
  AT_RISK: 'bg-amber-100 text-amber-800 border-amber-200',
  ON_TRACK: 'bg-blue-100 text-blue-800 border-blue-200',
  IDLE: 'bg-slate-100 text-slate-600 border-slate-200',
}

/**
 * プロジェクトの健全性。
 *
 * - 期限を過ぎて未完了 → 遅延
 * - 経過した時間の割に完了率が低い → 注意
 * - 期限超過タスクを抱えている → 注意
 */
export function projectHealth(input: {
  status: CoProjectStatus
  startOn: Date | null
  dueOn: Date | null
  progress: Progress
  overdueTaskCount: number
  now: Date
  timezone?: string
}): ProjectHealth {
  const { status, startOn, dueOn, progress, overdueTaskCount, now, timezone } = input
  if (status === 'DONE') return 'DONE'
  if (status === 'CANCELED') return 'IDLE'
  if (progress.total === 0) return 'IDLE'

  const remaining = daysUntilDue(dueOn, now, timezone)
  if (remaining !== null && remaining < 0 && progress.percent < 100) return 'DELAYED'

  if (startOn && dueOn && remaining !== null) {
    const span = daysUntilDue(dueOn, startOn, timezone)
    if (span !== null && span > 0) {
      const elapsed = span - remaining
      const expected = clampPercent((elapsed / span) * 100)
      // 想定より20ポイント以上遅れていたら黄信号
      if (expected - progress.percent >= 20) return 'AT_RISK'
    }
  }

  if (overdueTaskCount > 0) return 'AT_RISK'
  return status === 'ON_HOLD' ? 'IDLE' : 'ON_TRACK'
}

export interface Bucketed<T> {
  overdue: T[]
  today: T[]
  week: T[]
  later: T[]
  noDue: T[]
}

/**
 * 期限で仕分ける。今日・今週・期限超過の画面はすべてこれを通す。
 * 期限超過は「今日」に混ぜない。混ぜると、今日の分量が読めなくなる。
 */
export function bucketByDue<T>(
  items: T[],
  getDue: (item: T) => Date | null,
  now: Date,
  timezone?: string,
): Bucketed<T> {
  const result: Bucketed<T> = { overdue: [], today: [], week: [], later: [], noDue: [] }
  for (const item of items) {
    const days = daysUntilDue(getDue(item), now, timezone)
    if (days === null) result.noDue.push(item)
    else if (days < 0) result.overdue.push(item)
    else if (days === 0) result.today.push(item)
    else if (days <= 6) result.week.push(item)
    else result.later.push(item)
  }
  return result
}
