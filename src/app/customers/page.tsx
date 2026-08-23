import { HandlingStatus, type Prisma, ReplyState } from '@prisma/client'
import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CustomerFilters } from '@/components/CustomerFilters'
import { ElapsedBadge, StatusBadge, formatDateTimeJa } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { diffMinutes } from '@/lib/domain/time'
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

  const where: Prisma.ConversationWhereInput = {
    ...(onlyAwaiting ? { replyState: ReplyState.AWAITING } : {}),
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

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
              <th className="px-3 py-2">顧客名</th>
              <th className="px-3 py-2">LINEユーザーID</th>
              <th className="px-3 py-2">担当者</th>
              <th className="px-3 py-2">最終顧客メッセージ</th>
              <th className="px-3 py-2">受信日時</th>
              <th className="px-3 py-2">未返信経過</th>
              <th className="px-3 py-2">リマインド</th>
              <th className="px-3 py-2">対応状況</th>
              <th className="px-3 py-2">対応済み日時</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  該当する顧客はいません
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/customers/${c.customerId}`} className="font-medium hover:underline">
                      {c.customer.name ?? c.customer.displayName ?? '（名称未取得）'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{c.customer.lineUserId}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {c.customer.assignee?.name ?? <span className="text-orange-600">未設定</span>}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-slate-700" title={c.lastInboundText ?? ''}>
                    {c.lastInboundText ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {formatDateTimeJa(c.lastInboundAt, settings.timezone)}
                  </td>
                  <td className="px-3 py-2">
                    <ElapsedBadge
                      minutes={
                        c.replyState === ReplyState.AWAITING && c.firstUnrepliedAt
                          ? diffMinutes(now, c.firstUnrepliedAt)
                          : null
                      }
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600">{c.reminderCount}回</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={c.handlingStatus} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {formatDateTimeJa(c.resolvedAt, settings.timezone)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
