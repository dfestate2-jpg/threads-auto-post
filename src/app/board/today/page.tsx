import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { TodayActions } from '@/components/board/TodayActions'
import { TodayTasks, type TaskRow } from '@/components/board/TodayTasks'
import { requirePageSession } from '@/lib/auth/guard'
import { ANGLE_LABEL, isAngle, overdueDays } from '@/lib/board/ladder'
import { loadBoardContext } from '@/lib/board/settings'
import { customerLabel } from '@/lib/board/runner'
import { instantAtDayMinutes, dateKeyOf, formatShortDateJa } from '@/lib/domain/time'
import { prisma, withReadRetry } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ANGLE_TONE: Record<number, string> = {
  1: 'bg-slate-200 text-slate-700',
  2: 'bg-emerald-100 text-emerald-800',
  3: 'bg-amber-100 text-amber-900',
  4: 'bg-orange-200 text-orange-900',
  5: 'bg-red-200 text-red-900',
}

/**
 * 今日やること。
 *
 * LINEに届くのと**同じ中身・同じボタン**を並べる。LINEは1件ずつ流れてくるので
 * 今日の全体量が見えない。まとめて片付けたいとき、移動前に確認したいときの画面。
 *
 * 並ぶのは担当者本人が角度を付けた人だけ。システムが勝手に選ばないので、
 * 「出なくていい人が出る」ことが起きない。
 */
export default async function BoardTodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await requirePageSession()
  const params = await searchParams
  const ctx = await loadBoardContext()

  // 「自分の担当」が既定。切り替えれば他の人の分も見える
  const scope = params.staff ?? session.staffId ?? 'all'
  const todayKey = dateKeyOf(ctx.now, ctx.timezone)
  const startOfToday = instantAtDayMinutes(todayKey, 0, ctx.timezone)
  const endOfToday = instantAtDayMinutes(todayKey, 1440, ctx.timezone)

  const [rows, staff, tasks] = await withReadRetry(() =>
    Promise.all([
      prisma.boardEntry.findMany({
        where: {
          endedAt: null,
          dueAt: { not: null, lt: endOfToday },
          // 担当は顧客側にしか持たない。追客の担当＝顧客の担当
          ...(scope === 'all' ? {} : { customer: { assigneeId: scope === 'none' ? null : scope } }),
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              displayName: true,
              phone: true,
              assignee: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ dueAt: 'asc' }, { angle: 'desc' }],
        take: 200,
      }),
      prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      // 済んだものも今日ぶんだけは出す。押した直後に消えると、
      // 本当に押せたのか分からなくなる
      prisma.boardTask.findMany({
        where: {
          ...(scope === 'all' ? {} : { staffId: scope === 'none' ? null : scope }),
          OR: [{ doneAt: null, dueOn: { lt: endOfToday } }, { doneAt: { not: null }, dueOn: { gte: startOfToday, lt: endOfToday } }],
        },
        include: { staff: { select: { name: true } } },
        orderBy: [{ doneAt: 'asc' }, { dueOn: 'asc' }, { createdAt: 'asc' }],
        take: 100,
      }),
    ]),
  )

  const overdue = rows.filter((r) => r.dueAt && overdueDays(r.dueAt, ctx.now, ctx.timezone) > 0).length

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          今日やること
          {overdue > 0 ? <span className="ml-2 text-sm font-bold text-red-700">追客の超過 {overdue}件</span> : null}
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/board/settings" className="text-sm text-slate-500 underline">
            追客の設定
          </Link>
          <Link href="/board" className="btn-primary px-3 py-1.5 text-sm">
            ＋ ヒアリングシート
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          { id: 'all', name: 'すべて' },
          ...staff.map((s) => ({ id: s.id, name: s.name })),
          { id: 'none', name: '担当なし' },
        ].map((s) => (
          <Link
            key={s.id}
            href={`/board/today?staff=${s.id}`}
            className={`rounded-lg px-3 py-1.5 ${
              scope === s.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <div className="mb-4">
        <TodayTasks
          today={todayKey}
          tasks={tasks.map(
            (t): TaskRow => ({
              id: t.id,
              title: t.title,
              dueOn: formatShortDateJa(t.dueOn, ctx.timezone),
              done: t.doneAt !== null,
              overdue: overdueDays(t.dueOn, ctx.now, ctx.timezone),
              assigneeName: scope === 'all' ? (t.staff?.name ?? null) : null,
            }),
          )}
        />
      </div>

      <h2 className="mb-2 text-base font-bold">
        追客 <span className="ml-1 text-sm font-normal text-slate-500">{rows.length}件</span>
      </h2>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          今日やることはありません。
          <div className="mt-2 text-sm">
            <Link href="/board/list?angle=none" className="text-slate-700 underline">
              まだ角度を付けていないお客さまを見る
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const over = r.dueAt ? overdueDays(r.dueAt, ctx.now, ctx.timezone) : 0
            const name = customerLabel(r.customer)
            return (
              <li key={r.id} className={`card p-4 ${over > 0 ? 'border-red-200 bg-red-50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isAngle(r.angle) ? (
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${ANGLE_TONE[r.angle]}`}
                          title={ANGLE_LABEL[r.angle]}
                        >
                          {r.angle}
                        </span>
                      ) : null}
                      <Link href={`/customers/${r.customer.id}`} className="text-base font-bold hover:underline">
                        {name}
                      </Link>
                      {r.customer.assignee ? (
                        <span className="text-xs text-slate-500">{r.customer.assignee.name}</span>
                      ) : null}
                    </div>
                    <p className={`text-xs ${over > 0 ? 'font-bold text-red-700' : 'text-slate-500'}`}>
                      {over > 0
                        ? `期限を${over}日過ぎています（${r.dueAt ? formatShortDateJa(r.dueAt, ctx.timezone) : ''}）`
                        : '本日が追客日です'}
                    </p>
                    {r.customerTask ? (
                      <p className="text-sm text-slate-700">
                        <span className="text-slate-500">お客さん：</span>
                        {r.customerTask}
                      </p>
                    ) : null}
                    {r.staffTask ? (
                      <p className="text-sm text-slate-700">
                        <span className="text-slate-500">自分：</span>
                        {r.staffTask}
                      </p>
                    ) : null}
                    {r.customer.phone ? (
                      <a href={`tel:${r.customer.phone}`} className="text-sm text-slate-600 underline">
                        {r.customer.phone}
                      </a>
                    ) : null}
                  </div>
                  <TodayActions
                    entryId={r.id}
                    customerName={name}
                    askAngleAfterCall={ctx.settings.askAngleAfterCall}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </AppShell>
  )
}
