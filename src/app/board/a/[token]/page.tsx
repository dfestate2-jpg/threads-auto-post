import Link from 'next/link'

import { TodayActions } from '@/components/board/TodayActions'
import { requirePageSession } from '@/lib/auth/guard'
import { ANGLE_LABEL, isAngle, isDueToday, overdueDays } from '@/lib/board/ladder'
import { customerLabel } from '@/lib/board/runner'
import { loadBoardContext } from '@/lib/board/settings'
import { parseBoardToken } from '@/lib/board/token'
import { formatShortDateJa } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * LINEの通知ボタンから開く画面。
 *
 * postback ではなくリンクにしてあるのは、postback の受け口が
 * 稼働中のリマインドシステムの中にあり、そこへ触れないと決めたため。
 *
 * ここでは**まだ何も実行しない**。リンクはトーク履歴に残り、
 * 誰かが後から開くこともある。開いた瞬間に状態が変わると、
 * 見ただけのつもりが操作になってしまう。画面で押して初めて確定する。
 */
export default async function BoardActionPage({ params }: { params: Promise<{ token: string }> }) {
  // ログインしていなければログイン画面へ。戻り先はこのURL
  await requirePageSession()

  const { token } = await params
  const action = parseBoardToken(decodeURIComponent(token))

  if (!action) {
    return (
      <Frame>
        <h1 className="text-lg font-bold">リンクの期限が切れています</h1>
        <p className="mt-2 text-sm text-slate-600">
          お手数ですが、今日やることの画面から操作してください。
        </p>
        <Link href="/board/today" className="btn-primary mt-5 block px-4 py-3 text-center text-base">
          今日やることを開く
        </Link>
      </Frame>
    )
  }

  const ctx = await loadBoardContext()
  const entry = await prisma.boardEntry.findUnique({
    where: { id: action.entryId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          displayName: true,
          phone: true,
          assignee: { select: { name: true } },
        },
      },
    },
  })

  if (!entry) {
    return (
      <Frame>
        <h1 className="text-lg font-bold">お客様が見つかりません</h1>
        <p className="mt-2 text-sm text-slate-600">削除されたか、追客が終わっている可能性があります。</p>
        <Link href="/board/today" className="btn-primary mt-5 block px-4 py-3 text-center text-base">
          今日やることを開く
        </Link>
      </Frame>
    )
  }

  const name = customerLabel(entry.customer)
  const over = entry.dueAt ? overdueDays(entry.dueAt, ctx.now, ctx.timezone) : 0

  if (entry.endedAt) {
    return (
      <Frame>
        <h1 className="text-lg font-bold">{name} 様</h1>
        <p className="mt-2 text-sm text-slate-600">この方の追客はすでに終わっています。</p>
        <Link href="/board/today" className="btn-primary mt-5 block px-4 py-3 text-center text-base">
          今日やることを開く
        </Link>
      </Frame>
    )
  }

  return (
    <Frame>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isAngle(entry.angle) ? (
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
              角度{entry.angle}・{ANGLE_LABEL[entry.angle]}
            </span>
          ) : null}
          {entry.customer.assignee ? (
            <span className="text-xs text-slate-500">{entry.customer.assignee.name}</span>
          ) : null}
        </div>

        <h1 className="text-xl font-bold">{name} 様</h1>

        {/* すでに対応済みの人の古いリンクを開くこともある。
            そのとき「本日が追客日です」と出ると、まだ残っているように見えてしまう */}
        <p className={`text-sm ${over > 0 ? 'font-bold text-red-700' : 'text-slate-500'}`}>
          {over > 0
            ? `期限を${over}日過ぎています（${entry.dueAt ? formatShortDateJa(entry.dueAt, ctx.timezone) : ''}）`
            : isDueToday(entry.dueAt, ctx.now, ctx.timezone)
              ? '本日が追客日です'
              : entry.dueAt
                ? `対応済みです。次回は ${formatShortDateJa(entry.dueAt, ctx.timezone)}`
                : '次の追客は予定されていません'}
        </p>

        {entry.customerTask ? (
          <p className="text-sm">
            <span className="text-slate-500">お客さん：</span>
            {entry.customerTask}
          </p>
        ) : null}
        {entry.staffTask ? (
          <p className="text-sm">
            <span className="text-slate-500">自分：</span>
            {entry.staffTask}
          </p>
        ) : null}
        {entry.customer.phone ? (
          <a href={`tel:${entry.customer.phone}`} className="text-sm text-slate-700 underline">
            {entry.customer.phone} に電話する
          </a>
        ) : null}

        <div className="mt-3 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs text-slate-500">押すと確定します</p>
          <TodayActions entryId={entry.id} customerName={name} askAngleAfterCall={ctx.settings.askAngleAfterCall} />
        </div>

        <Link href="/board/today" className="mt-2 text-center text-sm text-slate-500 underline">
          今日やることを開く
        </Link>
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-8">
      <div className="card w-full max-w-sm p-5">{children}</div>
    </main>
  )
}
