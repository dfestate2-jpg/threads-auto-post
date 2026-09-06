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

  /**
   * 集計をまとめて1回で取る。
   *
   * 以前は件数ごとに12回クエリを投げていた。実行環境（米国）とデータベース（東京）が
   * 離れているうえ、サーバーレス向けに接続数を1に絞っているため、
   * 12回の往復が直列に積み上がって画面の表示が数秒かかっていた。
   * 数える対象はどれも同じ2つの表なので、条件付き集計で1回にまとめる。
   */
  const [totals] = await prisma.$queryRaw<
    {
      awaitingTotal: bigint
      over1h: bigint
      over3h: bigint
      over24h: bigint
      needsCheck: bigint
      inProgress: bigint
      notificationDisabled: bigint
      todayInbound: bigint
      todayResolved: bigint
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE cv."replyState" = 'AWAITING')                             AS "awaitingTotal",
      COUNT(*) FILTER (WHERE cv."replyState" = 'AWAITING'
                         AND cv."firstUnrepliedAt" <= ${h(1)})                         AS "over1h",
      COUNT(*) FILTER (WHERE cv."replyState" = 'AWAITING'
                         AND cv."firstUnrepliedAt" <= ${h(3)})                         AS "over3h",
      COUNT(*) FILTER (WHERE cv."replyState" = 'AWAITING'
                         AND cv."firstUnrepliedAt" <= ${h(24)})                        AS "over24h",
      COUNT(*) FILTER (WHERE cv."handlingStatus" = 'NEEDS_CHECK')                      AS "needsCheck",
      COUNT(*) FILTER (WHERE cv."handlingStatus" = 'IN_PROGRESS')                      AS "inProgress",
      COUNT(*) FILTER (WHERE cv."replyState" = 'AWAITING'
                         AND c."reminderIntervalMinutes" = 0)                          AS "notificationDisabled",
      (SELECT COUNT(*) FROM "messages"
        WHERE "direction" = 'INBOUND' AND "sentAt" >= ${todayStart})                    AS "todayInbound",
      (SELECT COUNT(DISTINCT "customerId") FROM "messages"
        WHERE "direction" = 'OUTBOUND' AND "sentAt" >= ${todayStart})                   AS "todayResolved"
    FROM "conversations" cv
    JOIN "customers" c ON c."id" = cv."customerId"
  `

  /** 担当者別の未返信件数【ダッシュボード要件】。以前は全件取得してJS側で数えていた */
  const assigneeRows = await prisma.$queryRaw<{ assigneeId: string | null; assigneeName: string | null; count: bigint }[]>`
    SELECT c."assigneeId" AS "assigneeId", s."name" AS "assigneeName", COUNT(*) AS "count"
    FROM "conversations" cv
    JOIN "customers" c ON c."id" = cv."customerId"
    LEFT JOIN "staff" s ON s."id" = c."assigneeId"
    WHERE cv."replyState" = 'AWAITING'
    GROUP BY c."assigneeId", s."name"
    ORDER BY COUNT(*) DESC
  `

  const lastRun = await prisma.cronRun.findFirst({
    where: { job: 'reminders', finishedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
  })

  const n = (value: bigint | undefined) => Number(value ?? 0n)
  const ageMinutes = lastRun ? Math.floor((now.getTime() - lastRun.startedAt.getTime()) / 60_000) : null

  return {
    awaitingTotal: n(totals?.awaitingTotal),
    over1h: n(totals?.over1h),
    over3h: n(totals?.over3h),
    over24h: n(totals?.over24h),
    todayInbound: n(totals?.todayInbound),
    todayResolved: n(totals?.todayResolved),
    needsCheck: n(totals?.needsCheck),
    inProgress: n(totals?.inProgress),
    notificationDisabled: n(totals?.notificationDisabled),
    byAssignee: assigneeRows.map((r) => ({
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName ?? '担当者未設定',
      count: Number(r.count),
    })),
    cron: {
      lastRunAt: lastRun?.startedAt ?? null,
      ageMinutes,
      healthy: ageMinutes !== null && ageMinutes <= 20,
      lastError: lastRun?.error ?? null,
    },
  }
}
