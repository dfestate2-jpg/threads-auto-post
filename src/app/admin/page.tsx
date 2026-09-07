import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { CustomerStatusBadge, StatCard } from '@/components/ui'
import { hasRole, requirePageSession } from '@/lib/auth/guard'
import { withReadRetry } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'
import { getAdminOverview } from '@/lib/services/salesStats'

export const dynamic = 'force-dynamic'

const RANGES = [
  { value: '30d', label: '過去30日', days: 30 },
  { value: '90d', label: '過去90日', days: 90 },
  { value: 'all', label: '全期間', days: null },
] as const

/**
 * 管理者画面。【指示書 14】
 *
 * 「全体でどれだけ追客が滞っているか」と「担当者ごとの動き」を1画面で見る。
 * 数字は追客履歴から作るため、営業マンの入力に依存しない。
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await requirePageSession()
  const params = await searchParams
  const settings = await getSettings()
  const now = new Date()

  const range = RANGES.find((r) => r.value === params.range) ?? RANGES[0]
  const since = range.days === null ? null : new Date(now.getTime() - range.days * 86_400_000)

  const overview = await withReadRetry(() => getAdminOverview({ timezone: settings.timezone, now, since }))
  const canSeeAll = hasRole(session, 'MANAGER')

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">管理者ダッシュボード</h1>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/admin?range=${r.value}`}
              className={`rounded px-3 py-1.5 text-xs ${
                r.value === range.value ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="🔴 期限超過" value={overview.overdue} tone={overview.overdue > 0 ? 'danger' : 'ok'} />
        <StatCard label="今日の追客対象" value={overview.todayDue} tone={overview.todayDue > 0 ? 'warn' : 'neutral'} />
        <StatCard label="本日の追客実施数" value={overview.todayFollowUps} tone="ok" />
        <StatCard
          label="担当者未設定"
          value={overview.unassigned}
          tone={overview.unassigned > 0 ? 'warn' : 'neutral'}
          hint={overview.unassigned > 0 ? '担当を割り当ててください' : undefined}
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="追客中の顧客" value={overview.activeCustomers} hint={`全顧客 ${overview.totalCustomers}名`} />
        <StatCard label="🟢 自動追客中" value={overview.autoFollowing} tone="ok" />
        <StatCard label="返信なし" value={overview.noReply} />
        <StatCard label="休眠" value={overview.dormant} hint="掘り起こし対象" />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="🎉 成約" value={overview.contracted} tone="ok" />
        <StatCard label="失注" value={overview.lost} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold">担当者別の成績（{range.label}）</h2>
          {!canSeeAll ? (
            <p className="py-6 text-center text-sm text-slate-500">担当者別の集計は責任者・管理者のみ表示されます</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2">担当者</th>
                  <th className="text-right">反響</th>
                  <th className="text-right">追客回数</th>
                  <th className="text-right">対応顧客</th>
                  <th className="text-right">内見</th>
                  <th className="text-right">申込</th>
                  <th className="text-right">成約</th>
                  <th className="text-right">成約率</th>
                  <th className="text-right">追客中</th>
                  <th className="text-right">期限超過</th>
                </tr>
              </thead>
              <tbody>
                {overview.staff.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-slate-500">
                      集計対象がありません
                    </td>
                  </tr>
                ) : (
                  overview.staff.map((s) => (
                    <tr key={s.staffId ?? 'none'} className="border-b border-slate-100 last:border-0">
                      <td className={`py-2 ${s.staffId ? 'text-slate-800' : 'font-medium text-orange-700'}`}>{s.staffName}</td>
                      <td className="text-right tabular-nums">{s.inquiries}</td>
                      <td className="text-right tabular-nums">{s.followUps}</td>
                      <td className="text-right tabular-nums">{s.contactedCustomers}</td>
                      <td className="text-right tabular-nums">{s.viewings}</td>
                      <td className="text-right tabular-nums">{s.applications}</td>
                      <td className="text-right font-semibold tabular-nums">{s.contracts}</td>
                      <td className="text-right tabular-nums">{(s.contractRate * 100).toFixed(1)}%</td>
                      <td className="text-right tabular-nums">{s.activeCustomers}</td>
                      <td className={`text-right tabular-nums ${s.overdue > 0 ? 'font-bold text-red-700' : ''}`}>{s.overdue}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold">ステータス別の件数</h2>
          <ul className="space-y-2">
            {overview.byStatus.map((s) => (
              <li key={s.status} className="flex items-center justify-between text-sm">
                <Link href={`/customers?status=${s.status}&view=all`} className="hover:underline">
                  <CustomerStatusBadge status={s.status} />
                </Link>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs">
            <Link href="/customers?view=overdue" className="block text-red-700 hover:underline">
              → 期限超過の顧客を見る（{overview.overdue}件）
            </Link>
            <Link href="/customers?view=today" className="block text-slate-600 hover:underline">
              → 今日の追客対象を見る（{overview.todayDue}件）
            </Link>
            <Link href="/customers?view=dormant" className="block text-slate-600 hover:underline">
              → 休眠顧客を見る（{overview.dormant}件）
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
