import { ReplyState } from '@prisma/client'
import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CustomerFilters } from '@/components/CustomerFilters'
import { CustomerRows } from '@/components/CustomerRows'
import { requirePageSession } from '@/lib/auth/guard'
import { diffMinutes, formatElapsedJa } from '@/lib/domain/time'
import { buildPauseAlert } from '@/lib/pauseAlert'
import { buildUnrepliedFilter } from '@/lib/services/unrepliedFilter'
import { prisma, withReadRetry } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * 未返信一覧。追客の一覧（/customers）とは目的が違うため画面を分けている。
 * こちらは「顧客を待たせていないか」だけを見る画面。
 */
export default async function UnrepliedCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePageSession()
  const params = await searchParams
  const settings = await getSettings()
  const now = new Date()

  const page = Math.max(1, Number(params.page ?? 1) || 1)
  /** ダッシュボードの「3時間以上未返信」などから直接この一覧へ来るための絞り込み（分） */
  const overMinutes = Number(params.over) > 0 ? Number(params.over) : null

  // 一括処理のAPIと同じ関数で組む。別々に組むと表示と閉じる対象が食い違う
  const { where, description } = buildUnrepliedFilter(params, now)

  const [rows, total, staff] = await withReadRetry(() =>

    Promise.all([
      prisma.conversation.findMany({
        where,
        include: { customer: { include: { assignee: true } } },
        orderBy: [{ firstUnrepliedAt: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.conversation.count({ where }),
      prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),

    ]),

  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    // 停止中は誰にも通知が届かない。未返信を見る画面では必ず最上部に出す
    <AppShell alert={buildPauseAlert(settings, now)}>
      <AutoRefresh />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">未返信一覧</h1>
        <span className="text-sm text-slate-500">{total}件</span>
      </div>

      <CustomerFilters staff={staff.map((s) => ({ id: s.id, name: s.name }))} basePath="/reminders/unreplied" />

      {overMinutes ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-white">
            {formatElapsedJa(overMinutes)}以上の未返信だけ
          </span>
          <Link href="/reminders/unreplied" className="text-slate-600 underline">
            絞り込みを外す
          </Link>
        </div>
      ) : null}

      <div className="mt-4">
        <CustomerRows
          rows={rows.map((c) => ({
            customerId: c.customerId,
            name: c.customer.name ?? c.customer.displayName ?? '（名称未取得）',
            lineUserId: c.customer.lineUserId,
            assigneeId: c.customer.assigneeId,
            assigneeName: c.customer.assignee?.name ?? null,
            lastInboundText: c.lastInboundText,
            lastInboundAt: c.lastInboundAt,
            elapsedMinutes:
              c.replyState === ReplyState.AWAITING && c.firstUnrepliedAt
                ? diffMinutes(now, c.firstUnrepliedAt)
                : null,
            reminderCount: c.reminderCount,
            handlingStatus: c.handlingStatus,
            version: c.version,
            resolvedAt: c.resolvedAt,
            inProgressUntil: c.inProgressUntil,
          }))}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          timezone={settings.timezone}
          bulkResolve
          total={total}
          filterDescription={description}
        />
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const sp = new URLSearchParams(params as Record<string, string>)
            sp.set('page', String(p))
            return (
              <Link
                key={p}
                href={`/reminders/unreplied?${sp.toString()}`}
                className={`rounded px-3 py-1 ${p === page ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                {p}
              </Link>
            )
          })}
        </div>
      ) : null}
    </AppShell>
  )
}
