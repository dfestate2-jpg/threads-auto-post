import { prisma } from '@/lib/prisma'
import { getCalendar, getSettings } from './settings'
import type { PolicyContext } from './policy'

/**
 * 設定・営業カレンダー・エスカレーション閾値をまとめて読み込む。
 * リクエスト単位・Cron実行単位で1回だけ呼ぶ。
 */
export async function loadPolicyContext(now = new Date()): Promise<PolicyContext> {
  const settings = await getSettings()
  const [calendar, rules] = await Promise.all([
    getCalendar(settings, now),
    prisma.escalationRule.findMany({
      where: { enabled: true },
      orderBy: { thresholdMinutes: 'asc' },
      select: { thresholdMinutes: true },
    }),
  ])
  return {
    settings,
    calendar,
    escalationThresholdsMinutes: rules.map((r) => r.thresholdMinutes),
  }
}
