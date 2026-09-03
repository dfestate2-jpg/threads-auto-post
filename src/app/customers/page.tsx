import { HandlingStatus, type Prisma, ReplyState } from '@prisma/client'
import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CustomerFilters } from '@/components/CustomerFilters'
import { CustomerRows } from '@/components/CustomerRows'
import { requirePageSession } from '@/lib/auth/guard'
import { diffMinutes, formatElapsedJa } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePageSession()
  const params = await searchParams
  const settings = await getSettings()
  const now = new Date()

  const status = params.status as HandlingStatus | undefined
  const assigneeId = params.assignee
  const onlyAwaiting = params.awaiting !== '0'
  const q = params.q?.trim()
  const page = Math.max(1, Number(params.page ?? 1) || 1)
  /** ダッシュボードの「3時間以上未返信」などから直接この一覧へ来るための絞り込み（分） */
  const overMinutes = Number(params.over) > 0 ? Number(params.over) : null

  const where: Prisma.ConversationWhereInput = {
    ...(onlyAwaiting ? { replyState: ReplyState.AWAITING } : {}),
    ...(overMinutes
      ? { firstUnrepliedAt: { not: null, lte: new Date(now.getTime() - overMinutes * 60_000) } }
      : {}),
    ...(status ? { handlingStatus: status } : {}),
    ...(assigneeId ? { customer: { assigneeId: assigneeId === 'none' ? null : assigneeId } } : {}),
    ...(q
      ? {
          customer: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { lineUserId: { contains: q } },
            ],
          },
        }
      : {}),
  }

  const [rows, total, staff] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: { customer: { include: { assignee: true } } },
      orderBy: [{ firstUnrepliedAt: 'asc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.conversation.count({ where }),
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <AppShell>
      <AutoRefresh seconds={60} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">未返信一覧</h1>
        <span className="text-sm text-slate-500">{total}件</span>
      </div>

      <CustomerFilters staff={staff.map((s) => ({ id: s.id, name: s.name }))} />

      {overMinutes ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-white">
            {formatElapsedJa(overMinutes)}以上の未返信だけ
          </span>
          <Link href="/customers" className="text-slate-600 underline">
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
            assigneeName: c.customer.assignee?.name ?? null,
            lastInboundText: c.lastInboundText,
            lastInboundAt: c.lastInboundAt,
            elapsedMinutes:
              c.replyState === ReplyState.AWAITING && c.firstUnrepliedAt
                ? diffMinutes(now, c.firstUnrepliedAt)
                : null,
            reminderCount: c.reminderCount,
            handlingStatus: c.handlingStatus,
            resolvedAt: c.resolvedAt,
          }))}
          timezone={settings.timezone}
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
                href={`/customers?${sp.toString()}`}
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
