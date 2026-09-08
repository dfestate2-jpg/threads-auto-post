import Link from 'next/link'

import { EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { daysUntilDue, formatDueLabel, formatShortDate } from '@/lib/company-os/date'
import { AREA_LABEL } from '@/lib/company-os/labels'
import { listDocuments } from '@/lib/services/companyOs/company'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { listRankedTasks } from '@/lib/services/companyOs/tasks'

export const dynamic = 'force-dynamic'

/**
 * 重要期限。
 *
 * 許認可の更新、契約の満了、法務系タスクの期限を1本にまとめる。
 * 期限は「気づいたときには過ぎている」ことが最大の問題なので、
 * 過ぎたもの・近いものを上に出す。
 */
export default async function LegalDeadlinesPage() {
  const ctx = await requireCompanyPage()
  const now = new Date()

  const [documents, tasks] = await Promise.all([
    listDocuments(ctx.company.id, ctx.role),
    listRankedTasks(ctx.company.id, { area: 'LEGAL' }, now),
  ])

  const docRows = documents
    .filter((d) => d.expiresOn !== null)
    .map((d) => ({
      id: d.id,
      title: d.name,
      kind: `書類・${AREA_LABEL[d.area]}`,
      dueOn: d.expiresOn,
      href: '/company-os/company/documents',
    }))

  const taskRows = tasks
    .filter((t) => t.task.dueOn !== null)
    .map((t) => ({
      id: t.task.id,
      title: t.task.title,
      kind: '法務タスク',
      dueOn: t.task.dueOn,
      href: `/company-os/tasks/${t.task.id}`,
    }))

  const rows = [...docRows, ...taskRows].sort((a, b) => (a.dueOn?.getTime() ?? 0) - (b.dueOn?.getTime() ?? 0))

  return (
    <>
      <PageHeader
        title="重要期限"
        description="許認可・契約の満了と、法務タスクの期限をまとめています。"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🗓"
          title="期限が設定されたものはありません"
          description="書類に更新期限を入れておくと、30日前からダッシュボードにも出ます。"
          action={
            <Link href="/company-os/company/documents" className="btn-secondary px-3 py-1.5 text-xs">
              書類を登録する
            </Link>
          }
        />
      ) : (
        <SectionCard title={`${rows.length}件`} hint="期限が近い順">
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const days = daysUntilDue(row.dueOn, now)
              const tone =
                days === null ? 'text-slate-400' : days < 0 ? 'text-red-600' : days <= 30 ? 'text-orange-600' : 'text-slate-500'
              return (
                <li key={`${row.kind}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={row.href} className="text-sm font-medium text-slate-900 hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-xs text-slate-400">{row.kind}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium tabular-nums ${tone}`}>
                    {formatShortDate(row.dueOn)}（{formatDueLabel(row.dueOn, now)}）
                  </span>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}
    </>
  )
}
