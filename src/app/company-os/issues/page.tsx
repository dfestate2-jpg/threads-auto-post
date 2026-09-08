import Link from 'next/link'

import { InlineSelect } from '@/components/company-os/InlineSelect'
import { RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { formatDueLabel, formatShortDate } from '@/lib/company-os/date'
import { issueFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL, ISSUE_STATUS_LABEL, SEVERITY_CLASS, SEVERITY_LABEL, optionsOf } from '@/lib/company-os/labels'
import { listIssues } from '@/lib/services/companyOs/management'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = optionsOf(ISSUE_STATUS_LABEL)

/**
 * 経営課題。
 * 「起きている問題」を、担当・原因・対策・次の一手とセットで持つ。
 * 課題だけ書いて終わると、何も変わらないため。
 */
export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireCompanyPage()
  const params = await searchParams
  const showResolved = params.resolved === '1'
  const now = new Date()

  const [issues, options] = await Promise.all([
    listIssues(ctx.company.id, ctx.role, { includeResolved: showResolved }),
    loadFormOptions(ctx.company.id),
  ])

  return (
    <>
      <PageHeader
        title="経営課題"
        description="会社で起きている問題を、原因・対策・次のアクションまで揃えて管理します。"
        action={
          <RecordDialog
            label="＋ 課題を登録"
            title="経営課題を登録"
            resource="issues"
            fields={issueFields(options)}
            record={{ severity: 'MEDIUM', status: 'OPEN', area: 'MANAGEMENT', visibility: 'ALL' }}
          />
        }
      />

      <div className="mb-4 flex gap-1.5">
        <Link
          href="/company-os/issues"
          className={`rounded-full px-3 py-1 text-xs font-medium ${!showResolved ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          未解決のみ
        </Link>
        <Link
          href="/company-os/issues?resolved=1"
          className={`rounded-full px-3 py-1 text-xs font-medium ${showResolved ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          解決済みも表示
        </Link>
      </div>

      {issues.length === 0 ? (
        <EmptyState
          icon="🟢"
          title="登録されている課題はありません"
          description="「100社になったときのサポート体制」のように、まだ起きていないが放置できないことも書けます。"
        />
      ) : (
        <SectionCard title={`${issues.length}件`}>
          <ul className="divide-y divide-slate-100">
            {issues.map((issue) => (
              <li key={issue.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEVERITY_CLASS[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Badge>
                      <Link
                        href={`/company-os/issues/${issue.id}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {issue.title}
                      </Link>
                    </div>
                    {issue.nextAction ? (
                      <p className="mt-1 text-xs text-slate-600">次のアクション：{issue.nextAction}</p>
                    ) : (
                      <p className="mt-1 text-xs text-orange-600">次のアクションが未記入です</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{AREA_LABEL[issue.area]}</span>
                      <span>{issue.owner ? `👤 ${issue.owner.name}` : '👤 担当未定'}</span>
                      <span>
                        {issue.dueOn ? `期限 ${formatShortDate(issue.dueOn)}（${formatDueLabel(issue.dueOn, now)}）` : '期限なし'}
                      </span>
                      {issue._count.tasks > 0 ? <span>対策タスク {issue._count.tasks}件</span> : null}
                    </div>
                  </div>
                  <InlineSelect
                    resource="issues"
                    id={issue.id}
                    name="status"
                    value={issue.status}
                    options={STATUS_OPTIONS}
                    ariaLabel={`${issue.title}のステータス`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  )
}
