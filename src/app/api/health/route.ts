import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 死活監視用。外部監視（UptimeRobot / Better Stack 等）から定期的に叩き、
 * `cronHealthy` が false になったらアラートを出す運用にする。
 * Cron 自体が停止した場合でもここで検知できるようにしている。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const lastRun = await prisma.cronRun.findFirst({
      where: { job: 'reminders', finishedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
    })
    const ageMinutes = lastRun ? Math.floor((Date.now() - lastRun.startedAt.getTime()) / 60_000) : null
    // 5分間隔運用に対し20分以上途絶えていたら異常とみなす
    const cronHealthy = ageMinutes !== null && ageMinutes <= 20

    const overdue = await prisma.conversation.count({
      where: { replyState: 'AWAITING', nextReminderAt: { lt: new Date(Date.now() - 30 * 60_000) } },
    })

    return NextResponse.json(
      {
        ok: true,
        cronHealthy,
        lastRunAt: lastRun?.startedAt ?? null,
        lastRunAgeMinutes: ageMinutes,
        lastRunError: lastRun?.error ?? null,
        overdueConversations: overdue,
      },
      { status: cronHealthy && overdue === 0 ? 200 : 503 },
    )
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
