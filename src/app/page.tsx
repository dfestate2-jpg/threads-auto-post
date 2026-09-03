import { ReplyState } from '@prisma/client'

import { AppShell } from '@/components/AppShell'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CustomerRows } from '@/components/CustomerRows'
import { StatCard, formatDateTimeJa } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { diffMinutes } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'
import { getDashboardStats } from '@/lib/services/stats'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requirePageSession()
  const settings = await getSettings()
  const now = new Date()
  const [stats, worst, staff] = await Promise.all([
    getDashboardStats(settings.timezone, now),
    prisma.conversation.findMany({
      where: { replyState: ReplyState.AWAITING },
      include: { customer: { include: { assignee: true } } },
      orderBy: { firstUnrepliedAt: 'asc' },
      take: 10,
    }),
    // ワースト10からその場で担当を割り振れるようにするため
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])

  const cronAlert = !stats.cron.healthy
    ? `⚠️ リマインドの定期実行が ${stats.cron.ageMinutes ?? '—'} 分間確認できていません。Cronの設定・実行状況を確認してください。`
    : null

  return (
    <AppShell alert={cronAlert}>
      <AutoRefresh />
      <h1 className="mb-4 text-xl font-bold">ダッシュボード</h1>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="🔴 未返信顧客数"
          value={stats.awaitingTotal}
          tone={stats.awaitingTotal > 0 ? 'danger' : 'ok'}
          href={stats.awaitingTotal > 0 ? '/customers' : undefined}
        />
        <StatCard
          label="🟠 1時間以上未返信"
          value={stats.over1h}
          tone={stats.over1h > 0 ? 'warn' : 'neutral'}
          href={stats.over1h > 0 ? '/customers?over=60' : undefined}
        />
        <StatCard
          label="🔴 3時間以上未返信"
          value={stats.over3h}
          tone={stats.over3h > 0 ? 'danger' : 'neutral'}
          href={stats.over3h > 0 ? '/customers?over=180' : undefined}
        />
        <StatCard
          label="🔴 24時間以上未返信"
          value={stats.over24h}
          tone={stats.over24h > 0 ? 'danger' : 'neutral'}
          href={stats.over24h > 0 ? '/customers?over=1440' : undefined}
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="本日のLINE受信数" value={stats.todayInbound} />
        <StatCard label="本日の対応済み数" value={stats.todayResolved} tone="ok" />
        <StatCard
          label="要確認"
          value={stats.needsCheck}
          tone={stats.needsCheck > 0 ? 'warn' : 'neutral'}
          href={stats.needsCheck > 0 ? '/customers?status=NEEDS_CHECK&awaiting=0' : undefined}
        />
        <StatCard
          label="通知OFF設定中"
          value={stats.notificationDisabled}
          hint={stats.notificationDisabled > 0 ? 'リマインドが送られません' : undefined}
          tone={stats.notificationDisabled > 0 ? 'warn' : 'neutral'}
        />
      </section>

      {/*
        ワースト10は幅いっぱいに置く。担当者・状況をその場で変えられるように
        してから列が増え、3分割の2列分では「状況」が見切れるようになった。
        一番押したい列が隠れる配置に、横スクロールで対処すべきではない。
        担当者別の集計は眺めるだけの情報なので、下に回す。
      */}
      <div className="mt-6 space-y-6">
        <section>
          <h2 className="mb-2 text-base font-bold">長時間未返信 ワースト10</h2>
          {worst.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">未返信の顧客はいません 🎉</p>
          ) : (
            <CustomerRows
              rows={worst.map((c) => ({
                customerId: c.customerId,
                name: c.customer.name ?? c.customer.displayName ?? '（名称未取得）',
                lineUserId: c.customer.lineUserId,
                assigneeId: c.customer.assigneeId,
                assigneeName: c.customer.assignee?.name ?? null,
                lastInboundText: c.lastInboundText,
                lastInboundAt: c.lastInboundAt,
                elapsedMinutes: c.firstUnrepliedAt ? diffMinutes(now, c.firstUnrepliedAt) : null,
                reminderCount: c.reminderCount,
                handlingStatus: c.handlingStatus,
                version: c.version,
                resolvedAt: c.resolvedAt,
              }))}
              staff={staff.map((s) => ({ id: s.id, name: s.name }))}
              timezone={settings.timezone}
            />
          )}
        </section>

        <section className="card max-w-md p-4">
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
