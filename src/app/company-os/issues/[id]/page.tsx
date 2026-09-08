import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { CommentPanel } from '@/components/company-os/TaskPanels'
import { Badge, Card, DefRow, PageHeader, SectionCard } from '@/components/company-os/ui'
import { formatDateTime, formatDueLabel, formatShortDate, toDateInput } from '@/lib/company-os/date'
import { issueFields, taskFields } from '@/lib/company-os/formSpecs'
import {
  AREA_LABEL, ISSUE_STATUS_CLASS, ISSUE_STATUS_LABEL, SEVERITY_CLASS, SEVERITY_LABEL,
  TASK_STATUS_CLASS, TASK_STATUS_LABEL, VISIBILITY_LABEL,
} from '@/lib/company-os/labels'
import { getIssue } from '@/lib/services/companyOs/management'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/** 課題の詳細。原因 → 対策 → タスク化、の流れをこの画面で完結させる */
export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanyPage()
  const { id } = await params
  const issue = await getIssue(ctx.company.id, ctx.role, id)
  if (!issue) notFound()

  const options = await loadFormOptions(ctx.company.id)
  const now = new Date()

  return (
    <>
      <div className="mb-3">
        <Link href="/company-os/issues" className="text-xs text-slate-500 hover:underline">
          ← 経営課題
        </Link>
      </div>

      <PageHeader
        title={issue.title}
        description={issue.detail ?? undefined}
        action={
          <div className="flex items-center gap-3">
            <RecordDialog
              label="編集"
              title="経営課題を編集"
              resource="issues"
              variant="secondary"
              fields={issueFields(options)}
              record={{
                id: issue.id,
                title: issue.title,
                detail: issue.detail,
                severity: issue.severity,
                status: issue.status,
                area: issue.area,
                ownerId: issue.ownerId,
                occurredOn: toDateInput(issue.occurredOn),
                dueOn: toDateInput(issue.dueOn),
                projectId: issue.projectId,
                cause: issue.cause,
                countermeasure: issue.countermeasure,
                nextAction: issue.nextAction,
                visibility: issue.visibility,
              }}
            />
            <DeleteButton resource="issues" id={issue.id} confirmText={`「${issue.title}」を削除します。よろしいですか？`} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="原因と対策" hint="ここが空のままの課題は、解決しません">
            <dl>
              <DefRow label="原因">{issue.cause ?? '未記入'}</DefRow>
              <DefRow label="対策">{issue.countermeasure ?? '未記入'}</DefRow>
              <DefRow label="次のアクション">{issue.nextAction ?? '未記入'}</DefRow>
            </dl>
          </SectionCard>

          <SectionCard
            title={`対策タスク（${issue.tasks.length}件）`}
            hint="対策を実行する担当と期限を決めると、課題が動き出します"
            action={
              <RecordDialog
                label="＋ 対策タスクを作る"
                title="対策タスクを作る"
                resource="tasks"
                variant="secondary"
                fields={taskFields(options)}
                record={{
                  status: 'TODO',
                  priority: issue.severity === 'CRITICAL' ? 'TOP' : 'HIGH',
                  area: issue.area,
                  issueId: issue.id,
                  projectId: issue.projectId,
                  assigneeId: issue.ownerId,
                  revenueImpact: '0',
                  riskImpact: issue.severity === 'CRITICAL' ? '3' : '2',
                }}
              />
            }
          >
            {issue.tasks.length === 0 ? (
              <p className="text-sm text-slate-400">まだありません。</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {issue.tasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 py-2">
                    <Link href={`/company-os/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {task.title}
                    </Link>
                    <span className="text-xs text-slate-400">{task.assignee?.name ?? '担当未定'}</span>
                    <Badge className={TASK_STATUS_CLASS[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="コメント">
            <CommentPanel
              target={{ issueId: issue.id }}
              comments={issue.comments.map((c) => ({
                id: c.id,
                authorName: c.authorName,
                body: c.body,
                createdAt: formatDateTime(c.createdAt),
              }))}
            />
          </SectionCard>
        </div>

        <Card className="h-fit p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className={SEVERITY_CLASS[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Badge>
            <Badge className={ISSUE_STATUS_CLASS[issue.status]}>{ISSUE_STATUS_LABEL[issue.status]}</Badge>
          </div>
          <dl>
            <DefRow label="担当者">{issue.owner?.name ?? '未定'}</DefRow>
            <DefRow label="発生日">{issue.occurredOn ? formatShortDate(issue.occurredOn) : '—'}</DefRow>
            <DefRow label="期限">
              {issue.dueOn ? `${formatShortDate(issue.dueOn)}（${formatDueLabel(issue.dueOn, now)}）` : '未設定'}
            </DefRow>
            <DefRow label="領域">{AREA_LABEL[issue.area]}</DefRow>
            <DefRow label="プロジェクト">
              {issue.project ? (
                <Link href={`/company-os/projects/${issue.project.id}`} className="hover:underline">
                  {issue.project.name}
                </Link>
              ) : (
                'なし'
              )}
            </DefRow>
            <DefRow label="発生元の会議">
              {issue.meeting ? (
                <Link href={`/company-os/meetings/${issue.meeting.id}`} className="hover:underline">
                  {issue.meeting.title}
                </Link>
              ) : (
                'なし'
              )}
            </DefRow>
            <DefRow label="公開範囲">{VISIBILITY_LABEL[issue.visibility]}</DefRow>
            <DefRow label="登録日">{formatDateTime(issue.createdAt)}</DefRow>
            {issue.resolvedAt ? <DefRow label="解決日">{formatDateTime(issue.resolvedAt)}</DefRow> : null}
          </dl>

          {issue.decisions.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-medium text-slate-500">この課題から生まれた決定</p>
              <ul className="space-y-1">
                {issue.decisions.map((d) => (
                  <li key={d.id} className="text-sm text-slate-700">
                    {d.title}
                    <span className="ml-2 text-xs text-slate-400">{formatShortDate(d.decidedOn)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  )
}
