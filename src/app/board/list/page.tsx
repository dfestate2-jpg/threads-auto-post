import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { AngleSelect } from '@/components/board/AngleSelect'
import { requirePageSession } from '@/lib/auth/guard'
import { overdueDays } from '@/lib/board/ladder'
import { OUTCOME_LABEL } from '@/lib/board/service'
import { loadBoardContext } from '@/lib/board/settings'
import { customerLabel } from '@/lib/board/runner'
import { formatShortDateJa } from '@/lib/domain/time'
import { prisma, withReadRetry } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * 一覧。台帳であると同時に、**「追客に入れる」2つめの入口**。
 *
 * 各行の角度プルダウンで、電話していないお客さまもその場で追客に入れられる。
 * 「角度なし」で絞り込めば、まだ判断していない人だけが並ぶ——ここが拾い上げの場所。
 */
function whereFor(view: string | undefined, staff: string | undefined, q: string | undefined): Prisma.CustomerWhereInput {
  const scope: Prisma.CustomerWhereInput[] = []

  switch (view) {
    case 'none':
      // まだ角度を付けていない人。行が無い場合も含む
      scope.push({ OR: [{ boardEntry: { is: null } }, { boardEntry: { angle: null } }] })
      break
    case 'chasing':
      scope.push({ boardEntry: { angle: { gte: 2 }, endedAt: null } })
      break
    case 'dropped':
      scope.push({ boardEntry: { angle: 1 } })
      break
    case 'ended':
      scope.push({ boardEntry: { endedAt: { not: null } } })
      break
    default:
      break
  }

  if (staff && staff !== 'all') {
    scope.push(staff === 'none' ? { boardEntry: { assigneeId: null } } : { boardEntry: { assigneeId: staff } })
  }
  if (q) {
    scope.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    })
  }

  return scope.length === 0 ? {} : { AND: scope }
}

export default async function BoardListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePageSession()
  const params = await searchParams
  const ctx = await loadBoardContext()

  const view = params.angle ?? 'all'
  const staffScope = params.staff ?? 'all'
  const q = params.q?.trim()
  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const where = whereFor(view, staffScope, q)

  const [rows, total, staff, counts] = await withReadRetry(() =>
    Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          boardEntry: { include: { assignee: { select: { id: true, name: true } } } },
        },
        // 期限が近い人が上。まだ角度の無い人は最後に回す
        orderBy: [{ boardEntry: { dueAt: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.customer.count({ where }),
      prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.customer.count({
        where: { OR: [{ boardEntry: { is: null } }, { boardEntry: { angle: null } }] },
      }),
    ]),
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const views = [
    { id: 'all', name: 'すべて' },
    { id: 'none', name: `角度なし（${counts}）` },
    { id: 'chasing', name: '追客中' },
    { id: 'dropped', name: '追わない' },
    { id: 'ended', name: '終了' },
  ]

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          一覧 <span className="ml-2 text-sm font-normal text-slate-500">{total}件</span>
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/board/settings" className="text-sm text-slate-500 underline">
            追客の設定
          </Link>
          <Link href="/board" className="btn-primary px-3 py-1.5 text-sm">
            ＋ 通話メモ
          </Link>
        </div>
      </div>

      <form className="mb-3" action="/board/list">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="お名前・電話番号で検索"
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        {view !== 'all' ? <input type="hidden" name="angle" value={view} /> : null}
      </form>

      <div className="mb-2 flex flex-wrap gap-2 text-sm">
        {views.map((v) => (
          <Link
            key={v.id}
            href={`/board/list?angle=${v.id}${staffScope !== 'all' ? `&staff=${staffScope}` : ''}`}
            className={`rounded-lg px-3 py-1.5 ${
              view === v.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            {v.name}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {[{ id: 'all', name: '担当すべて' }, ...staff.map((s) => ({ id: s.id, name: s.name })), { id: 'none', name: '担当なし' }].map(
          (s) => (
            <Link
              key={s.id}
              href={`/board/list?angle=${view}&staff=${s.id}`}
              className={`rounded-lg px-2.5 py-1 ${
                staffScope === s.id ? 'bg-slate-700 text-white' : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {s.name}
            </Link>
          ),
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
              <th className="px-3 py-2">角度</th>
              <th className="px-3 py-2">お客様</th>
              <th className="px-3 py-2">担当</th>
              <th className="px-3 py-2">次回追客</th>
              <th className="px-3 py-2">内容</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                  該当するお客様はいません
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const e = c.boardEntry
                const over = e?.dueAt ? overdueDays(e.dueAt, ctx.now, ctx.timezone) : 0
                const name = customerLabel(c)
                return (
                  <tr key={c.id} className={`border-b border-slate-100 last:border-0 ${over > 0 ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2">
                      <AngleSelect customerId={c.id} customerName={name} value={e?.angle ?? null} />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                        {name}
                      </Link>
                      {c.phone ? <div className="text-xs text-slate-500">{c.phone}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{e?.assignee?.name ?? <span className="text-slate-400">—</span>}</td>
                    <td className={`px-3 py-2 text-xs ${over > 0 ? 'font-bold text-red-700' : 'text-slate-700'}`}>
                      {e?.endedAt ? (
                        <span className="text-slate-500">
                          終了{e.endedOutcome ? `・${OUTCOME_LABEL[e.endedOutcome]}` : ''}
                        </span>
                      ) : e?.dueAt ? (
                        <>
                          {formatShortDateJa(e.dueAt, ctx.timezone)}
                          {over > 0 ? <span className="block">{over}日超過</span> : null}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {e?.customerTask ? <div>お客さん：{e.customerTask}</div> : null}
                      {e?.staffTask ? <div>自分：{e.staffTask}</div> : null}
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
                href={`/board/list?${sp.toString()}`}
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
