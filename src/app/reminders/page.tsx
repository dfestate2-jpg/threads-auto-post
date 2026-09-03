import { ReplyState } from '@prisma/client'
import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { AutoRefresh } from '@/components/AutoRefresh'
import { ElapsedBadge, StatCard, StatusBadge, formatDateTimeJa } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { diffMinutes } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'
import { getDashboardStats } from '@/lib/services/stats'

export const dynamic = 'force-dynamic'

/**
 * 未返信リマインドのダッシュボード。
 * トップ画面は「今日やること」に譲り、こちらは未返信の監視に専念する。
 */
export default async function ReminderDashboardPage() {
  await requirePageSession()
  const settings = await getSettings()
  const now = new Date()
  const [stats, worst] = await Promise.all([
    getDashboardStats(settings.timezone, now),
    prisma.conversation.findMany({
      where: { replyState: ReplyState.AWAITING },
      include: { customer: { include: { assignee: true } } },
      orderBy: { firstUnrepliedAt: 'asc' },
      take: 10,
    }),
  ])

  const cronAlert = !stats.cron.healthy
    ? `⚠️ リマインドの定期実行が ${stats.cron.ageMinutes ?? '—'} 分間確認できていません。Cronの設定・実行状況を確認してください。`
    : null

  return (
    <AppShell alert={cronAlert}>
      <AutoRefresh seconds={60} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">未返信リマインド</h1>
        <Link href="/reminders/unreplied" className="btn-secondary px-3 py-1.5 text-sm">
          未返信一覧を開く
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="🔴 未返信顧客数" value={stats.awaitingTotal} tone={stats.awaitingTotal > 0 ? 'danger' : 'ok'} />
        <StatCard label="🟠 1時間以上未返信" value={stats.over1h} tone={stats.over1h > 0 ? 'warn' : 'neutral'} />
        <StatCard label="🔴 3時間以上未返信" value={stats.over3h} tone={stats.over3h > 0 ? 'danger' : 'neutral'} />
        <StatCard label="🔴 24時間以上未返信" value={stats.over24h} tone={stats.over24h > 0 ? 'danger' : 'neutral'} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="本日のLINE受信数" value={stats.todayInbound} />
        <StatCard label="本日の対応済み数" value={stats.todayResolved} tone="ok" />
        <StatCard label="要確認" value={stats.needsCheck} tone={stats.needsCheck > 0 ? 'warn' : 'neutral'} />
        <StatCard
          label="通知OFF設定中"
          value={stats.notificationDisabled}
          hint={stats.notificationDisabled > 0 ? 'リマインドが送られません' : undefined}
          tone={stats.notificationDisabled > 0 ? 'warn' : 'neutral'}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold">長時間未返信 ワースト10</h2>
          {worst.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">未返信の顧客はいません 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2">顧客名</th>
                  <th>担当者</th>
                  <th>未返信経過</th>
                  <th>リマインド</th>
                  <th>状況</th>
                  <th>受信日時</th>
                </tr>
              </thead>
              <tbody>
                {worst.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">
                      <Link href={`/customers/${c.customerId}`} className="font-medium text-slate-900 hover:underline">
                        {c.customer.name ?? c.customer.displayName ?? c.customer.lineUserId}
                      </Link>
                    </td>
                    <td className="text-slate-600">{c.customer.assignee?.name ?? '未設定'}</td>
                    <td>
                      <ElapsedBadge minutes={c.firstUnrepliedAt ? diffMinutes(now, c.firstUnrepliedAt) : null} />
                    </td>
                    <td className="tabular-nums text-slate-600">{c.reminderCount}回</td>
                    <td>
                      <StatusBadge status={c.handlingStatus} />
                    </td>
                    <td className="text-xs text-slate-500">{formatDateTimeJa(c.lastInboundAt, settings.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold">担当者別の未返信件数</h2>
          {stats.byAssignee.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">未返信はありません</p>
          ) : (
            <ul className="space-y-2">
              {stats.byAssignee.map((a) => (
                <li key={a.assigneeId ?? 'none'} className="flex items-center justify-between text-sm">
                  <span className={a.assigneeId ? 'text-slate-700' : 'font-medium text-orange-700'}>
                    {a.assigneeName}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold tabular-nums">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            最終Cron実行：{formatDateTimeJa(stats.cron.lastRunAt, settings.timezone)}
            {stats.cron.lastError ? <span className="text-red-600"> / エラー: {stats.cron.lastError}</span> : null}
          </p>
        </section>
      </div>
    </AppShell>
  )
}
