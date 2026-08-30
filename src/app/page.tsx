import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { AutoRefresh } from '@/components/AutoRefresh'
import { TodaySection, type TodayItem } from '@/components/followup/TodaySection'
import { StatCard } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { formatShortDateJa } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'
import { getTodayList } from '@/lib/services/todayList'

export const dynamic = 'force-dynamic'

/**
 * ログイン後のトップ画面＝「今日やること」。【指示書 7・17】
 *
 * 顧客一覧を見せる画面ではない。
 * ログインした瞬間に「今日、誰に、何をするか」が分かることだけを目的にしている。
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await requirePageSession()
  const params = await searchParams
  const settings = await getSettings()
  const now = new Date()

  // 既定は「自分の担当のみ」。担当を持たない管理者は全件を見る
  const showAll = params.scope === 'all' || !session.staffId
  const assigneeId = showAll ? null : session.staffId

  const [list, staffName] = await Promise.all([
    getTodayList({ timezone: settings.timezone, now, assigneeId, includeUnassigned: true }),
    session.staffId
      ? prisma.staff.findUnique({ where: { id: session.staffId }, select: { name: true } })
      : Promise.resolve(null),
  ])

  const toItem = (r: (typeof list.overdue)[number]): TodayItem => ({
    id: r.id,
    name: r.name,
    status: r.status,
    priority: r.priority,
    nextActionType: r.nextActionType,
    nextActionNote: r.nextActionNote,
    dueLabel: r.nextActionAt ? formatShortDateJa(r.nextActionAt, settings.timezone) : '未設定',
    reason: r.reason,
    overdueDays: r.overdueDays,
    assigneeName: r.assigneeName,
    phone: r.phone,
    hasLine: r.hasLine,
  })

  const todayLabel = formatShortDateJa(now, settings.timezone)

  return (
    <AppShell>
      <AutoRefresh seconds={120} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">
            今日やること
            <span className="ml-2 text-sm font-normal text-slate-500">{todayLabel}</span>
          </h1>
          <p className="text-xs text-slate-500">
            {showAll ? '全担当者' : `${staffName?.name ?? '自分'}の担当`}／
            対応が必要な顧客 {list.todayTotal}名
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={showAll ? '/' : '/?scope=all'}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {showAll ? '自分の担当だけ表示' : '全担当者を表示'}
          </Link>
          <Link href="/customers/new" className="btn-primary px-3 py-1.5 text-xs">
            ＋ 顧客登録
          </Link>
        </div>
      </div>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="🔴 期限超過"
          value={list.overdue.length}
          tone={list.overdue.length > 0 ? 'danger' : 'ok'}
          hint={list.overdue.length > 0 ? '今すぐ対応してください' : '超過ゼロ'}
        />
        <StatCard label="🔴 最優先" value={list.top.length} tone={list.top.length > 0 ? 'warn' : 'neutral'} />
        <StatCard label="🟡 通常" value={list.normal.length} />
        <StatCard label="🟢 自動追客中" value={list.autoCount} tone="ok" hint="システムが管理中" />
      </section>

      <div className="space-y-4">
        <TodaySection
          title="🔴 期限超過"
          tone="danger"
          items={list.overdue.map(toItem)}
          emptyText="期限超過はありません 🎉"
          hint="追客の期限を過ぎています"
        />
        <TodaySection
          title="🔴 最優先"
          tone="warn"
          items={list.top.map(toItem)}
          emptyText="最優先の対応はありません"
          hint="今日中に対応"
        />
        <TodaySection
          title="🟡 通常"
          tone="normal"
          items={list.normal.map(toItem)}
          emptyText="通常追客の対応はありません"
        />
        {list.needsDecision.length > 0 ? (
          <TodaySection
            title="⚪️ 追客ルール終了（要判断）"
            tone="normal"
            items={list.needsDecision.map(toItem)}
            emptyText=""
            hint="自動追客のステップを使い切りました。保留・失注などを選んでください"
          />
        ) : null}
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        🟢 自動追客中の {list.autoCount} 名は、次回の追客日が来たらこの画面に自動で現れます。
      </p>
    </AppShell>
  )
}
