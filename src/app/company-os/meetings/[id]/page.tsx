import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MinutesExtractor } from '@/components/company-os/MinutesExtractor'
import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, Card, EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { formatDateTime, formatShortDate, toDateTimeInput } from '@/lib/company-os/date'
import { meetingFields } from '@/lib/company-os/formSpecs'
import {
  ISSUE_STATUS_CLASS, ISSUE_STATUS_LABEL, QUESTION_STATUS_CLASS, QUESTION_STATUS_LABEL,
  TASK_STATUS_CLASS, TASK_STATUS_LABEL, VISIBILITY_LABEL,
} from '@/lib/company-os/labels'
import { getMeeting } from '@/lib/services/companyOs/management'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/** 会議の詳細。議事録と、そこから生まれたものを同じ画面に並べる */
export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanyPage()
  const { id } = await params
  const meeting = await getMeeting(ctx.company.id, ctx.role, id)
  if (!meeting) notFound()

  const attendees = Array.isArray(meeting.attendees) ? (meeting.attendees as string[]) : []
  const hasMinutes = (meeting.minutes ?? '').trim().length > 0

  return (
    <>
      <div className="mb-3">
        <Link href="/company-os/meetings" className="text-xs text-slate-500 hover:underline">
          ← 会議ログ
        </Link>
      </div>

      <PageHeader
        title={meeting.title}
        description={`${formatDateTime(meeting.heldAt)}${attendees.length > 0 ? `・参加者：${attendees.join('、')}` : ''}${meeting.visibility === 'ALL' ? '' : `・${VISIBILITY_LABEL[meeting.visibility]}`}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <MinutesExtractor meetingId={meeting.id} hasMinutes={hasMinutes} />
            <RecordDialog
              label="編集"
              title="会議を編集"
              resource="meetings"
              variant="secondary"
              fields={meetingFields()}
              record={{
                id: meeting.id,
                title: meeting.title,
                heldAt: toDateTimeInput(meeting.heldAt),
                attendees,
                agenda: meeting.agenda,
                minutes: meeting.minutes,
                visibility: meeting.visibility,
              }}
            />
            <DeleteButton resource="meetings" id={meeting.id} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {meeting.agenda ? (
            <SectionCard title="議題">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{meeting.agenda}</p>
            </SectionCard>
          ) : null}

          <SectionCard
            title="議事録"
            hint="「## 決定事項」「## タスク」などの見出しを付けておくと、自動で仕分けできます"
          >
            {hasMinutes ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{meeting.minutes}</p>
            ) : (
              <EmptyState icon="📝" title="議事録が未入力です" description="編集から貼り付けてください。" />
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title={`決定事項（${meeting.decisions.length}件）`}>
            {meeting.decisions.length === 0 ? (
              <p className="text-sm text-slate-400">まだありません</p>
            ) : (
              <ul className="space-y-2">
                {meeting.decisions.map((d) => (
                  <li key={d.id} className="text-sm text-slate-700">
                    {d.title}
                    <span className="ml-2 text-xs text-slate-400">{formatShortDate(d.decidedOn)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`発生したタスク（${meeting.tasks.length}件）`}>
            {meeting.tasks.length === 0 ? (
              <p className="text-sm text-slate-400">まだありません</p>
            ) : (
              <ul className="space-y-2">
                {meeting.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <Link href={`/company-os/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {t.title}
                    </Link>
                    <Badge className={TASK_STATUS_CLASS[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`課題（${meeting.issues.length}件）`}>
            {meeting.issues.length === 0 ? (
              <p className="text-sm text-slate-400">まだありません</p>
            ) : (
              <ul className="space-y-2">
                {meeting.issues.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    <Link href={`/company-os/issues/${i.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {i.title}
                    </Link>
                    <Badge className={ISSUE_STATUS_CLASS[i.status]}>{ISSUE_STATUS_LABEL[i.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`未決事項（${meeting.questions.length}件）`}>
            {meeting.questions.length === 0 ? (
              <p className="text-sm text-slate-400">まだありません</p>
            ) : (
              <ul className="space-y-2">
                {meeting.questions.map((q) => (
                  <li key={q.id} className="flex items-center gap-2">
                    <Link href="/company-os/questions" className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {q.title}
                    </Link>
                    <Badge className={QUESTION_STATUS_CLASS[q.status]}>{QUESTION_STATUS_LABEL[q.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <Card className="p-4">
            <p className="text-xs leading-relaxed text-slate-500">
              議事録の仕分けは、登録前に必ず一覧で確認できます。
              種類の付け替えと取捨選択をしてから登録してください。
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
