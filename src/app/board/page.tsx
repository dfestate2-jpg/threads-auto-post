import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { CallMemoForm } from '@/components/board/CallMemoForm'
import { requirePageSession } from '@/lib/auth/guard'
import { customerLabel } from '@/lib/board/runner'
import { loadBoardContext } from '@/lib/board/settings'
import { dateKeyOf } from '@/lib/domain/time'
import { prisma, withReadRetry } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** ヒアリングシートの入力。接客や電話が終わったらここに来る */
export default async function BoardPage() {
  const session = await requirePageSession()
  const ctx = await loadBoardContext()

  const [customers, staff] = await withReadRetry(() =>
    Promise.all([
      prisma.customer.findMany({
        select: { id: true, name: true, displayName: true, phone: true },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    ]),
  )

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">ヒアリングシート</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/board/today" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600">
            今日やること
          </Link>
          <Link href="/board/list" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600">
            一覧
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-xl">
        <CallMemoForm
          customers={customers.map((c) => ({ id: c.id, name: customerLabel(c), phone: c.phone }))}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          defaultStaffId={session.staffId}
          today={dateKeyOf(ctx.now, ctx.timezone)}
        />
      </div>
    </AppShell>
  )
}
