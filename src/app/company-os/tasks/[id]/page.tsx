import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { ChecklistPanel, CommentPanel, DependencyPanel } from '@/components/company-os/TaskPanels'
import { Badge, Card, DefRow, PageHeader, SectionCard } from '@/components/company-os/ui'
import { formatDateTime, formatDueLabel, formatShortDate, toDateInput } from '@/lib/company-os/date'
import { taskFields } from '@/lib/company-os/formSpecs'
import {
  AREA_LABEL, IMPACT_LABEL, PRIORITY_CLASS, PRIORITY_LABEL, TASK_STATUS_CLASS, TASK_STATUS_LABEL,
} from '@/lib/company-os/labels'
import { prisma } from '@/lib/prisma'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { getTask } from '@/lib/services/companyOs/tasks'

export const dynamic = 'force-dynamic'

/**
 * タスクの詳細。
 * 1画面で「何を・誰が・いつまでに・なぜ・何を待っているか」まで分かるようにする。
 */
export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanyPage()
  const { id } = await params
  const task = await getTask(ctx.company.id, id)
  if (!task) notFound()

  const now = new Date()
  const [options, candidates] = await Promise.all([
    loadFormOptions(ctx.company.id),
    prisma.coTask.findMany({
      where: { companyId: ctx.company.id, id: { not: id } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
      take: 300,
    }),
  ])

  const linkedIds = new Set(task.dependencies.map((d) => d.dependsOnId))

  return (
    <>
      <div className="mb-3">
        <Link href="/company-os/tasks" className="text-xs text-slate-500 hover:underline">
          ← タスク一覧
        </Link>
      </div>

      <PageHeader
        title={task.title}
        description={task.description ?? undefined}
        action={
          <div className="flex items-center gap-3">
            <RecordDialog
              label="編集"
              title="タスクを編集"
              resource="tasks"
              variant="secondary"
              fields={taskFields(options)}
              record={{
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                area: task.area,
                assigneeId: task.assigneeId,
                projectId: task.projectId,
                issueId: task.issueId,
                startOn: toDateInput(task.startOn),
                dueOn: toDateInput(task.dueOn),
                relatedCustomer: task.relatedCustomer,
                relatedParty: task.relatedParty,
                revenueImpact: String(task.revenueImpact),
                riskImpact: String(task.riskImpact),
              }}
            />
            <DeleteButton resource="tasks" id={task.id} confirmText={`「${task.title}」を削除します。よろしいですか？`} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="チェックリスト" hint="タスクを分解しておくと、途中でも進み具合が分かります">
            <ChecklistPanel
              taskId={task.id}
              items={task.checklist.map((c) => ({ id: c.id, label: c.label, done: c.done }))}
            />
          </SectionCard>

          <SectionCard title="依存関係">
            <DependencyPanel
              taskId={task.id}
              dependencies={task.dependencies.map((d) => ({
                id: d.dependsOn.id,
                title: d.dependsOn.title,
                status: d.dependsOn.status,
                statusLabel: TASK_STATUS_LABEL[d.dependsOn.status],
              }))}
              dependents={task.dependents.map((d) => ({
                id: d.task.id,
                title: d.task.title,
                status: d.task.status,
                statusLabel: TASK_STATUS_LABEL[d.task.status],
              }))}
              candidates={candidates
                .filter((c) => !linkedIds.has(c.id))
                .map((c) => ({ value: c.id, label: c.title }))}
            />
          </SectionCard>

          <SectionCard title="コメント">
            <CommentPanel
              target={{ taskId: task.id }}
              comments={task.comments.map((c) => ({
                id: c.id,
                authorName: c.authorName,
                body: c.body,
                createdAt: formatDateTime(c.createdAt),
              }))}
            />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge className={TASK_STATUS_CLASS[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
              <Badge className={PRIORITY_CLASS[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
            </div>
            <dl>
              <DefRow label="期限">
                {task.dueOn ? `${formatShortDate(task.dueOn)}（${formatDueLabel(task.dueOn, now)}）` : '未設定'}
              </DefRow>
              <DefRow label="開始日">{task.startOn ? formatShortDate(task.startOn) : '未設定'}</DefRow>
              <DefRow label="担当者">{task.assignee?.name ?? '未定'}</DefRow>
              <DefRow label="カテゴリー">{AREA_LABEL[task.area]}</DefRow>
              <DefRow label="プロジェクト">
                {task.project ? (
                  <Link href={`/company-os/projects/${task.project.id}`} className="text-slate-700 hover:underline">
                    {task.project.name}
                  </Link>
                ) : (
                  'なし'
                )}
              </DefRow>
              <DefRow label="関連する経営課題">
                {task.issue ? (
                  <Link href={`/company-os/issues/${task.issue.id}`} className="text-slate-700 hover:underline">
                    {task.issue.title}
                  </Link>
                ) : (
                  'なし'
                )}
              </DefRow>
              <DefRow label="発生元の会議">
                {task.meeting ? (
                  <Link href={`/company-os/meetings/${task.meeting.id}`} className="text-slate-700 hover:underline">
                    {task.meeting.title}
                  </Link>
                ) : (
                  'なし'
                )}
              </DefRow>
              <DefRow label="関連顧客">{task.relatedCustomer ?? '—'}</DefRow>
              <DefRow label="関連会社">{task.relatedParty ?? '—'}</DefRow>
              <DefRow label="売上への影響">{IMPACT_LABEL[task.revenueImpact] ?? '—'}</DefRow>
              <DefRow label="リスク">{IMPACT_LABEL[task.riskImpact] ?? '—'}</DefRow>
              <DefRow label="作成日">{formatDateTime(task.createdAt)}</DefRow>
              <DefRow label="更新日">{formatDateTime(task.updatedAt)}</DefRow>
              {task.completedAt ? <DefRow label="完了日">{formatDateTime(task.completedAt)}</DefRow> : null}
            </dl>
          </Card>

          {task.documents.length > 0 ? (
            <SectionCard title="関連資料">
              <ul className="space-y-1">
                {task.documents.map((doc) => (
                  <li key={doc.id} className="text-sm text-slate-700">
                    {doc.name}
                    {doc.location ? <span className="ml-2 text-xs text-slate-400">{doc.location}</span> : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </>
  )
}
