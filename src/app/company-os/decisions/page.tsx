import Link from 'next/link'

import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { formatShortDate, toDateInput } from '@/lib/company-os/date'
import { decisionFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL, VISIBILITY_LABEL } from '@/lib/company-os/labels'
import { listDecisions } from '@/lib/services/companyOs/management'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * 意思決定。
 *
 * 会社経営でいちばん失われやすいのは「なぜそう決めたか」。
 * 決定を書き換えたときは履歴が残るようにしてあり、
 * 「いつの間にか変わっていた」が起きない。
 */
export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireCompanyPage()
  const params = await searchParams
  const importantOnly = params.important === '1'

  const [decisions, options] = await Promise.all([
    listDecisions(ctx.company.id, ctx.role, { important: importantOnly, q: params.q }),
    loadFormOptions(ctx.company.id),
  ])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHeader
        title="意思決定"
        description="決めたことと、その理由を残します。重要な決定はダッシュボードにも出ます。"
        action={
          <RecordDialog
            label="＋ 決定を記録"
            title="意思決定を記録"
            resource="decisions"
            fields={decisionFields(options)}
            record={{ decidedOn: today, area: 'MANAGEMENT', visibility: 'ALL', deciderName: ctx.userName }}
          />
        }
      />

      <div className="mb-4 flex gap-1.5">
        <Link
          href="/company-os/decisions"
          className={`rounded-full px-3 py-1 text-xs font-medium ${!importantOnly ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          すべて
        </Link>
        <Link
          href="/company-os/decisions?important=1"
          className={`rounded-full px-3 py-1 text-xs font-medium ${importantOnly ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          重要な決定のみ
        </Link>
      </div>

      {decisions.length === 0 ? (
        <EmptyState
          icon="📌"
          title="まだ決定が記録されていません"
          description="「当面は2人で会社を立ち上げる」「代表者は○○」など、決めた時点で残しておくと後から迷いません。"
        />
      ) : (
        <div className="space-y-3">
          {decisions.map((decision) => (
            <SectionCard
              key={decision.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {decision.important ? <Badge className="border-red-200 bg-red-50 text-red-700">重要</Badge> : null}
                  <span>{decision.title}</span>
                </span>
              }
              hint={`${formatShortDate(decision.decidedOn)}・${decision.decider?.name ?? decision.deciderName ?? '決定者未記入'}・${AREA_LABEL[decision.area]}${decision.visibility === 'ALL' ? '' : `・${VISIBILITY_LABEL[decision.visibility]}`}`}
              action={
                <div className="flex items-center gap-3">
                  <RecordDialog
                    label="編集"
                    title="意思決定を編集"
                    resource="decisions"
                    variant="link"
                    fields={decisionFields(options)}
                    record={{
                      id: decision.id,
                      title: decision.title,
                      background: decision.background,
                      reason: decision.reason,
                      decidedOn: toDateInput(decision.decidedOn),
                      deciderId: decision.deciderId,
                      deciderName: decision.deciderName,
                      area: decision.area,
                      projectId: decision.projectId,
                      issueId: decision.issueId,
                      important: decision.important,
                      visibility: decision.visibility,
                    }}
                  />
                  <DeleteButton resource="decisions" id={decision.id} />
                </div>
              }
            >
              <dl className="space-y-2 text-sm">
                {decision.background ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">背景</dt>
                    <dd className="whitespace-pre-wrap text-slate-700">{decision.background}</dd>
                  </div>
                ) : null}
                {decision.reason ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">理由</dt>
                    <dd className="whitespace-pre-wrap text-slate-700">{decision.reason}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                {decision.project ? (
                  <Link href={`/company-os/projects/${decision.project.id}`} className="hover:underline">
                    📁 {decision.project.name}
                  </Link>
                ) : null}
                {decision.issue ? (
                  <Link href={`/company-os/issues/${decision.issue.id}`} className="hover:underline">
                    ⚠️ {decision.issue.title}
                  </Link>
                ) : null}
                {decision.meeting ? (
                  <Link href={`/company-os/meetings/${decision.meeting.id}`} className="hover:underline">
                    🗓 {decision.meeting.title}
                  </Link>
                ) : null}
              </div>

              {decision.revisions.length > 0 ? (
                <details className="mt-3 border-t border-slate-100 pt-2">
                  <summary className="cursor-pointer text-xs text-slate-500">
                    変更履歴（{decision.revisions.length}件）
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {decision.revisions.map((rev) => (
                      <li key={rev.id} className="text-xs text-slate-500">
                        {formatShortDate(rev.createdAt)}・{rev.summary}
                        {rev.changedBy ? `（${rev.changedBy}）` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </SectionCard>
          ))}
        </div>
      )}
    </>
  )
}
