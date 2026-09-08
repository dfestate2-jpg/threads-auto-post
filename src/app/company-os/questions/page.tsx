import Link from 'next/link'

import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { ResolveQuestionButton } from '@/components/company-os/ResolveQuestion'
import { Badge, EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { formatDueLabel, formatShortDate, toDateInput } from '@/lib/company-os/date'
import { questionFields } from '@/lib/company-os/formSpecs'
import {
  AREA_LABEL, QUESTION_STATUS_CLASS, QUESTION_STATUS_LABEL, SEVERITY_CLASS, SEVERITY_LABEL,
} from '@/lib/company-os/labels'
import { listQuestions } from '@/lib/services/companyOs/management'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

interface Choice {
  label?: string
  pros?: string
  cons?: string
}

/**
 * 未決事項。
 *
 * 決まっていないことを一覧にしておかないと、
 * 「誰も決めていない」ことに誰も気づかないまま時間だけが過ぎる。
 */
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireCompanyPage()
  const params = await searchParams
  const includeDecided = params.decided === '1'
  const now = new Date()

  const [questions, options] = await Promise.all([
    listQuestions(ctx.company.id, { includeDecided }),
    loadFormOptions(ctx.company.id),
  ])

  return (
    <>
      <PageHeader
        title="未決事項"
        description="まだ決まっていないことを、論点・選択肢・推奨案とセットで並べます。"
        action={
          <RecordDialog
            label="＋ 未決事項を登録"
            title="未決事項を登録"
            resource="questions"
            fields={questionFields(options)}
            record={{ status: 'OPEN', severity: 'MEDIUM', area: 'MANAGEMENT', options: [] }}
          />
        }
      />

      <div className="mb-4 flex gap-1.5">
        <Link
          href="/company-os/questions"
          className={`rounded-full px-3 py-1 text-xs font-medium ${!includeDecided ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          未決のみ
        </Link>
        <Link
          href="/company-os/questions?decided=1"
          className={`rounded-full px-3 py-1 text-xs font-medium ${includeDecided ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          決定済みも表示
        </Link>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon="❓"
          title="未決事項はありません"
          description="会社名・料金・株式比率・役割分担・採用時期など、迷っていることを書き出しておくと、決める順番が見えます。"
        />
      ) : (
        <div className="space-y-3">
          {questions.map((question) => {
            const choices = Array.isArray(question.options) ? (question.options as Choice[]) : []
            return (
              <SectionCard
                key={question.id}
                title={question.title}
                hint={[
                  AREA_LABEL[question.area],
                  question.owner ? `担当 ${question.owner.name}` : '担当未定',
                  question.dueOn ? `期限 ${formatShortDate(question.dueOn)}（${formatDueLabel(question.dueOn, now)}）` : '期限なし',
                ].join('・')}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={SEVERITY_CLASS[question.severity]}>{SEVERITY_LABEL[question.severity]}</Badge>
                    <Badge className={QUESTION_STATUS_CLASS[question.status]}>
                      {QUESTION_STATUS_LABEL[question.status]}
                    </Badge>
                    {question.status !== 'DECIDED' ? (
                      <ResolveQuestionButton
                        questionId={question.id}
                        questionTitle={question.title}
                        recommendation={question.recommendation}
                        members={options.members}
                        defaultDecider={ctx.userName}
                      />
                    ) : null}
                    <RecordDialog
                      label="編集"
                      title="未決事項を編集"
                      resource="questions"
                      variant="link"
                      fields={questionFields(options)}
                      record={{
                        id: question.id,
                        title: question.title,
                        point: question.point,
                        options: choices,
                        recommendation: question.recommendation,
                        status: question.status,
                        severity: question.severity,
                        area: question.area,
                        ownerId: question.ownerId,
                        dueOn: toDateInput(question.dueOn),
                        projectId: question.projectId,
                      }}
                    />
                    <DeleteButton resource="questions" id={question.id} />
                  </div>
                }
              >
                {question.point ? (
                  <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{question.point}</p>
                ) : null}

                {choices.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {choices.map((choice, index) => (
                      <div key={index} className="rounded-lg border border-slate-200 p-3">
                        <p className="text-sm font-medium text-slate-900">{choice.label || `案${index + 1}`}</p>
                        {choice.pros ? (
                          <p className="mt-1 text-xs text-emerald-700">◎ {choice.pros}</p>
                        ) : null}
                        {choice.cons ? <p className="mt-0.5 text-xs text-red-600">× {choice.cons}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">選択肢が未入力です。案を並べると比べられます。</p>
                )}

                {question.recommendation ? (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    <span className="text-xs font-medium text-slate-500">推奨案：</span>
                    {question.recommendation}
                  </p>
                ) : null}

                {question.decision ? (
                  <p className="mt-3 text-xs text-slate-500">
                    決定済み：
                    <Link href="/company-os/decisions" className="ml-1 hover:underline">
                      {question.decision.title}
                    </Link>
                  </p>
                ) : null}
              </SectionCard>
            )
          })}
        </div>
      )}
    </>
  )
}
