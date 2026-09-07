import { CustomerStatus, type Prisma } from '@prisma/client'
import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { AssigneeSelect } from '@/components/AssigneeSelect'
import { CustomerListFilters } from '@/components/followup/CustomerListFilters'
import { ActionBadge, CustomerStatusBadge, PriorityBadge, formatDateTimeJa } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { TERMINAL_STATUSES } from '@/lib/domain/followUp'
import { endOfDayIn, startOfDayIn } from '@/lib/domain/time'
import { prisma, withReadRetry } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/** 一覧の「表示」切り替え。管理者が見たい切り口をそのままボタンにしている */
function whereForView(view: string | undefined, startOfToday: Date, endOfToday: Date): Prisma.CustomerWhereInput {
  switch (view) {
    case 'overdue':
      return { status: { notIn: TERMINAL_STATUSES }, nextActionAt: { lt: startOfToday } }
    case 'today':
      return { status: { notIn: TERMINAL_STATUSES }, nextActionAt: { gte: startOfToday, lte: endOfToday } }
    case 'no_reply':
      return { status: CustomerStatus.NO_REPLY }
    case 'dormant':
      return { status: CustomerStatus.DORMANT }
    case 'contracted':
      return { status: CustomerStatus.CONTRACTED }
    case 'lost':
      return { status: CustomerStatus.LOST }
    case 'all':
      return {}
    default:
      return { status: { notIn: TERMINAL_STATUSES } }
  }
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePageSession()
  const params = await searchParams
  const settings = await getSettings()
  const now = new Date()
  const startOfToday = startOfDayIn(settings.timezone, now)
  const endOfToday = endOfDayIn(settings.timezone, now)

  const status = params.status as CustomerStatus | undefined
  const assigneeId = params.assignee
  const q = params.q?.trim()
  const page = Math.max(1, Number(params.page ?? 1) || 1)

  const where: Prisma.CustomerWhereInput = {
    ...whereForView(params.view, startOfToday, endOfToday),
    ...(status ? { status } : {}),
    ...(assigneeId ? { assigneeId: assigneeId === 'none' ? null : assigneeId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  }

  const [rows, total, staff] = await withReadRetry(() =>

    Promise.all([
      prisma.customer.findMany({
        where,
        // 担当者プルダウンは楽観ロックに会話の version を使う。LINE未連携の顧客には会話が無い
        include: { assignee: { select: { name: true } }, conversation: { select: { version: true } } },
        // 期限が近い顧客ほど上。未設定（＝要判断）は最後に回す
        orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.customer.count({ where }),
      prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),

    ]),

  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const staffOptions = staff.map((s) => ({ id: s.id, name: s.name }))

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          顧客一覧 <span className="ml-2 text-sm font-normal text-slate-500">{total}件</span>
        </h1>
        <Link href="/customers/new" className="btn-primary px-3 py-1.5 text-sm">
          ＋ 顧客登録
        </Link>
      </div>

      <CustomerListFilters staff={staffOptions} />

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
              <th className="px-3 py-2">優先</th>
              <th className="px-3 py-2">顧客名</th>
              <th className="px-3 py-2">ステータス</th>
              <th className="px-3 py-2">担当</th>
              <th className="px-3 py-2">希望エリア / 家賃</th>
              <th className="px-3 py-2">最終接触</th>
              <th className="px-3 py-2">次回アクション</th>
              <th className="px-3 py-2">内容</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                  該当する顧客はいません
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const overdue = c.nextActionAt !== null && c.nextActionAt.getTime() < startOfToday.getTime()
                return (
                  <tr key={c.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${overdue ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                        {c.name ?? c.displayName ?? '（名称未登録）'}
                      </Link>
                      {c.phone ? <div className="text-xs text-slate-500">{c.phone}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <CustomerStatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-2">
                      <AssigneeSelect
                        customerId={c.id}
                        customerName={c.name ?? c.displayName ?? '（名称未登録）'}
                        value={c.assigneeId}
                        valueName={c.assignee?.name ?? null}
                        staff={staffOptions}
                        version={c.conversation?.version ?? null}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {c.desiredArea ?? '—'}
                      {c.desiredRent ? ` / ${c.desiredRent.toLocaleString('ja-JP')}円` : ''}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {formatDateTimeJa(c.lastContactAt, settings.timezone)}
                    </td>
                    <td className={`px-3 py-2 text-xs ${overdue ? 'font-bold text-red-700' : 'text-slate-700'}`}>
                      {c.nextActionAt ? formatDateTimeJa(c.nextActionAt, settings.timezone) : '要判断'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ActionBadge type={c.nextActionType} />
                        <span className="text-xs text-slate-600">{c.nextActionNote ?? ''}</span>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const sp = new URLSearchParams(params as Record<string, string>)
            sp.set('page', String(p))
            return (
              <Link
                key={p}
                href={`/customers?${sp.toString()}`}
                className={`rounded px-3 py-1 ${p === page ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
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
