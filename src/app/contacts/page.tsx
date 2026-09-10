import { ConsentStatus } from '@prisma/client'

import { AppShell } from '@/components/AppShell'
import { ContactImport } from '@/components/campaigns/ContactImport'
import { StatCard } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CONSENT_LABEL: Record<ConsentStatus, string> = {
  OPTED_IN: '配信同意あり',
  UNKNOWN: '同意不明',
  UNSUBSCRIBED: '配信停止',
}

export default async function ContactsPage() {
  await requirePageSession()

  const [counts, suppressed, recent] = await Promise.all([
    prisma.contact.groupBy({ by: ['consent'], _count: { _all: true } }),
    prisma.suppression.count(),
    prisma.contact.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  ])
  const countOf = (c: ConsentStatus): number => counts.find((r) => r.consent === c)?._count._all ?? 0
  const optedIn = countOf(ConsentStatus.OPTED_IN)

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">配信先リスト</h1>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="配信同意あり" value={optedIn} tone={optedIn > 0 ? 'ok' : 'neutral'} />
        <StatCard
          label="同意不明"
          value={countOf(ConsentStatus.UNKNOWN)}
          hint="既定では配信対象に入りません"
          tone={countOf(ConsentStatus.UNKNOWN) > 0 ? 'warn' : 'neutral'}
        />
        <StatCard label="配信停止" value={countOf(ConsentStatus.UNSUBSCRIBED)} />
        <StatCard label="停止台帳（再取込しても復活しません）" value={suppressed} />
      </section>

      <div className="mt-6">
        <ContactImport />
      </div>

      <section className="card mt-6 p-4">
        <h2 className="mb-3 text-sm font-bold">最近登録された配信先（最新50件）</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">まだ配信先が登録されていません。上のフォームから取り込んでください。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2">メールアドレス</th>
                  <th className="py-2">名前</th>
                  <th className="py-2">希望エリア</th>
                  <th className="py-2">予算</th>
                  <th className="py-2">同意</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 font-mono text-xs">{c.email}</td>
                    <td className="py-2">{c.name ?? '—'}</td>
                    <td className="py-2 text-xs">{c.areas.join('・') || '—'}</td>
                    <td className="py-2 text-xs">
                      {c.budgetMax ? `〜${c.budgetMax.toLocaleString('ja-JP')}万円` : '—'}
                    </td>
                    <td className="py-2 text-xs">
                      <span
                        className={
                          c.consent === 'OPTED_IN'
                            ? 'text-emerald-700'
                            : c.consent === 'UNSUBSCRIBED'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }
                      >
                        {CONSENT_LABEL[c.consent]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  )
}
