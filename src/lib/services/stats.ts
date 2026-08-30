import { Direction, HandlingStatus, ReplyState } from '@prisma/client'

import { startOfDayIn } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'

export interface DashboardStats {
  awaitingTotal: number
  over1h: number
  over3h: number
  over24h: number
  todayInbound: number
  todayResolved: number
  needsCheck: number
  inProgress: number
  notificationDisabled: number
  byAssignee: { assigneeId: string | null; assigneeName: string; count: number }[]
  cron: { lastRunAt: Date | null; ageMinutes: number | null; healthy: boolean; lastError: string | null }
}

/** タイムゾーン基準の「今日の 00:00」 */
export function startOfTodayIn(timezone: string, now = new Date()): Date {
  return startOfDayIn(timezone, now)
}

/**
 * ダッシュボード用の集計。
 * 未返信経過は firstUnrepliedAt（最初の未返信メッセージ）基準で数える。
 * 顧客の連投で awaitingSince が動いても「放置されている実時間」が正しく見えるようにするため。
 */
export async function getDashboardStats(timezone: string, now = new Date()): Promise<DashboardStats> {
  const todayStart = startOfTodayIn(timezone, now)
  const h = (hours: number) => new Date(now.getTime() - hours * 3_600_000)
  const awaiting = { replyState: ReplyState.AWAITING } as const

  const [
    awaitingTotal,
    over1h,
    over3h,
    over24h,
    todayInbound,
    todayResolvedRows,
    needsCheck,
    inProgress,
    notificationDisabled,
    assigneeGroups,
    staffRows,
    lastRun,
  ] = await Promise.all([
    prisma.conversation.count({ where: awaiting }),
    prisma.conversation.count({ where: { ...awaiting, firstUnrepliedAt: { lte: h(1) } } }),
    prisma.conversation.count({ where: { ...awaiting, firstUnrepliedAt: { lte: h(3) } } }),
    prisma.conversation.count({ where: { ...awaiting, firstUnrepliedAt: { lte: h(24) } } }),
    prisma.message.count({ where: { direction: Direction.INBOUND, sentAt: { gte: todayStart } } }),
    prisma.message.findMany({
      where: { direction: Direction.OUTBOUND, sentAt: { gte: todayStart } },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
    prisma.conversation.count({ where: { handlingStatus: HandlingStatus.NEEDS_CHECK } }),
    prisma.conversation.count({ where: { handlingStatus: HandlingStatus.IN_PROGRESS } }),
    prisma.conversation.count({ where: { ...awaiting, customer: { reminderIntervalMinutes: 0 } } }),
    prisma.conversation.groupBy({
      by: ['customerId'],
      where: awaiting,
      _count: { _all: true },
    }),
    prisma.customer.findMany({
      where: { conversation: { replyState: ReplyState.AWAITING } },
      select: { id: true, assigneeId: true, assignee: { select: { name: true } } },
    }),
    prisma.cronRun.findFirst({
      where: { job: 'reminders', finishedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
    }),
  ])

  // 担当者別の未返信件数【ダッシュボード要件】
  const counter = new Map<string, { assigneeId: string | null; assigneeName: string; count: number }>()
  for (const c of staffRows) {
    const key = c.assigneeId ?? '__unassigned__'
    const entry = counter.get(key) ?? {
      assigneeId: c.assigneeId,
      assigneeName: c.assignee?.name ?? '担当者未設定',
      count: 0,
    }
    entry.count += 1
    counter.set(key, entry)
  }
  void assigneeGroups

  const ageMinutes = lastRun ? Math.floor((now.getTime() - lastRun.startedAt.getTime()) / 60_000) : null

  return {
    awaitingTotal,
    over1h,
    over3h,
    over24h,
    todayInbound,
    todayResolved: todayResolvedRows.length,
    needsCheck,
    inProgress,
    notificationDisabled,
    byAssignee: [...counter.values()].sort((a, b) => b.count - a.count),
    cron: {
      lastRunAt: lastRun?.startedAt ?? null,
      ageMinutes,
      healthy: ageMinutes !== null && ageMinutes <= 20,
      lastError: lastRun?.error ?? null,
    },
  }
}
