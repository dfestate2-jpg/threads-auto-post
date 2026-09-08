import Link from 'next/link'

import { RecordDialog } from '@/components/company-os/RecordDialog'
import { EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { formatDateTime, toDateTimeInput } from '@/lib/company-os/date'
import { meetingFields } from '@/lib/company-os/formSpecs'
import { MINUTES_SAMPLE } from '@/lib/company-os/minutes'
import { listMeetings } from '@/lib/services/companyOs/management'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * 会議ログ。
 * 会議は「話した」だけでは意味がなく、決定・タスク・課題・未決事項が
 * 出てきて初めて価値になる。この画面は、その変換の入口。
 */
export default async function MeetingsPage() {
  const ctx = await requireCompanyPage()
  const meetings = await listMeetings(ctx.company.id, ctx.role)

  return (
    <>
      <PageHeader
        title="会議ログ"
        description="議事録を残すと、決定事項・タスク・課題・未決事項へ自動で仕分けできます。"
        action={
          <RecordDialog
            label="＋ 会議を記録"
            title="会議を記録"
            resource="meetings"
            fields={meetingFields()}
            record={{ heldAt: toDateTimeInput(new Date()), visibility: 'ALL', attendees: [], minutes: MINUTES_SAMPLE }}
          />
        }
      />

      {meetings.length === 0 ? (
        <EmptyState
          icon="🗓"
          title="会議の記録がありません"
          description="議事録を貼り付けておくと、あとから「何を決めたか」を探せます。"
        />
      ) : (
        <SectionCard title={`${meetings.length}件`}>
          <ul className="divide-y divide-slate-100">
            {meetings.map((meeting) => {
              const attendees = Array.isArray(meeting.attendees) ? (meeting.attendees as string[]) : []
              return (
                <li key={meeting.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/company-os/meetings/${meeting.id}`}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      {meeting.title}
                    </Link>
                    <span className="text-xs text-slate-500">{formatDateTime(meeting.heldAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {attendees.length > 0 ? `参加者：${attendees.join('、')}` : '参加者未記入'}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>決定 {meeting._count.decisions}</span>
                    <span>タスク {meeting._count.tasks}</span>
                    <span>課題 {meeting._count.issues}</span>
                    <span>未決 {meeting._count.questions}</span>
                  </p>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}
    </>
  )
}
