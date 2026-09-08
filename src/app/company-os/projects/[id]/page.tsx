import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { TaskList } from '@/components/company-os/TaskList'
import { MilestoneList } from '@/components/company-os/MilestoneList'
import { Badge, Card, DefRow, PageHeader, ProgressBar, SectionCard } from '@/components/company-os/ui'
import { formatDueLabel, formatShortDate, toDateInput } from '@/lib/company-os/date'
import { milestoneFields, projectFields, taskFields } from '@/lib/company-os/formSpecs'
import {
  AREA_LABEL, ISSUE_STATUS_CLASS, ISSUE_STATUS_LABEL, PRIORITY_CLASS, PRIORITY_LABEL,
  PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL, SEVERITY_CLASS, SEVERITY_LABEL,
} from '@/lib/company-os/labels'
import { HEALTH_CLASS, HEALTH_LABEL } from '@/lib/company-os/progress'
import { prisma } from '@/lib/prisma'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { listProjectSummaries } from '@/lib/services/companyOs/projects'
import { listRankedTasks } from '@/lib/services/companyOs/tasks'

export const dynamic = 'force-dynamic'

/** プロジェクトの詳細。進捗・期限・タスク・課題・マイルストーンを1画面に集める */
export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanyPage()
  const { id } = await params
  const now = new Date()

  const summaries = await listProjectSummaries(ctx.company.id, now, undefined, { includeClosed: true })
  const summary = summaries.find((s) => s.project.id === id)
  if (!summary) notFound()
  const project = summary.project

  const [tasks, issues, decisions, options] = await Promise.all([
    listRankedTasks(ctx.company.id, { projectId: id, includeClosed: true }, now),
    prisma.coIssue.findMany({ where: { companyId: ctx.company.id, projectId: id }, orderBy: { severity: 'asc' } }),
    prisma.coDecision.findMany({
      where: { companyId: ctx.company.id, projectId: id },
      orderBy: { decidedOn: 'desc' },
      take: 10,
    }),
    loadFormOptions(ctx.company.id),
  ])

  const openTasks = tasks.filter((t) => t.task.status !== 'DONE' && t.task.status !== 'CANCELED')
  const doneTasks = tasks.filter((t) => t.task.status === 'DONE')

  return (
    <>
      <div className="mb-3">
        <Link href="/company-os/projects" className="text-xs text-slate-500 hover:underline">
          ← プロジェクト一覧
        </Link>
      </div>

      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={
          <div className="flex items-center gap-3">
            <RecordDialog
              label="編集"
              title="プロジェクトを編集"
              resource="projects"
              variant="secondary"
              fields={projectFields(options)}
              record={{
                id: project.id,
                name: project.name,
                description: project.description,
                status: project.status,
                priority: project.priority,
                area: project.area,
                ownerId: project.ownerId,
                startOn: toDateInput(project.startOn),
                dueOn: toDateInput(project.dueOn),
                progressOverride: project.progressOverride === null ? '' : String(project.progressOverride),
              }}
            />
            <DeleteButton
              resource="projects"
              id={project.id}
              confirmText={`「${project.name}」を削除します。タスクは残り、プロジェクトの割り当てだけが外れます。よろしいですか？`}
            />
          </div>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className={PROJECT_STATUS_CLASS[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Badge>
            <Badge className={HEALTH_CLASS[summary.health]}>{HEALTH_LABEL[summary.health]}</Badge>
            <Badge className={PRIORITY_CLASS[project.priority]}>{PRIORITY_LABEL[project.priority]}</Badge>
          </div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold tabular-nums text-slate-900">{summary.progress.percent}%</span>
            <span className="text-xs text-slate-500">
              {summary.progress.done}/{summary.progress.total} 件完了
              {project.progressOverride !== null ? '（手入力）' : ''}
            </span>
          </div>
          <ProgressBar
            percent={summary.progress.percent}
            tone={summary.health === 'DELAYED' ? 'danger' : summary.health === 'AT_RISK' ? 'warn' : 'ok'}
          />
          <dl className="mt-3">
            <DefRow label="期間">
              {project.startOn ? formatShortDate(project.startOn) : '未設定'} 〜{' '}
              {project.dueOn ? `${formatShortDate(project.dueOn)}（${formatDueLabel(project.dueOn, now)}）` : '未設定'}
            </DefRow>
            <DefRow label="責任者">{project.owner?.name ?? '未定'}</DefRow>
            <DefRow label="領域">{AREA_LABEL[project.area]}</DefRow>
          </dl>
        </Card>

        <SectionCard
          title="マイルストーン"
          action={
            <RecordDialog
              label="＋ 追加"
              title="マイルストーンを追加"
              resource="milestones"
              variant="link"
              fields={milestoneFields()}
              extraPayload={{ projectId: project.id }}
            />
          }
        >
          <MilestoneList
            milestones={project.milestones.map((m) => ({
              id: m.id,
              name: m.name,
              dueLabel: m.dueOn ? `${formatShortDate(m.dueOn)}（${formatDueLabel(m.dueOn, now)}）` : '期限なし',
              done: m.done,
            }))}
          />
        </SectionCard>
      </div>

      <div className="space-y-4">
        <SectionCard
          title={`タスク（未完了 ${openTasks.length}件）`}
          action={
            <RecordDialog
              label="＋ タスクを追加"
              title="タスクを追加"
              resource="tasks"
              variant="secondary"
              fields={taskFields(options)}
              record={{
                status: 'TODO',
                priority: 'MEDIUM',
                area: project.area,
                projectId: project.id,
                revenueImpact: '0',
                riskImpact: '0',
              }}
            />
          }
        >
          <TaskList rows={openTasks} now={now} showProject={false} emptyText="未完了のタスクはありません" />
        </SectionCard>

        {doneTasks.length > 0 ? (
          <SectionCard title={`完了したタスク（${doneTasks.length}件）`}>
            <TaskList rows={doneTasks} now={now} showProject={false} />
          </SectionCard>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={`関連する経営課題（${issues.length}件）`}>
            {issues.length === 0 ? (
              <p className="text-sm text-slate-400">ありません</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {issues.map((issue) => (
                  <li key={issue.id} className="flex items-center gap-2 py-2">
                    <Badge className={SEVERITY_CLASS[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Badge>
                    <Link href={`/company-os/issues/${issue.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {issue.title}
                    </Link>
                    <Badge className={ISSUE_STATUS_CLASS[issue.status]}>{ISSUE_STATUS_LABEL[issue.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`このプロジェクトの決定事項（${decisions.length}件）`}>
            {decisions.length === 0 ? (
              <p className="text-sm text-slate-400">ありません</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {decisions.map((d) => (
                  <li key={d.id} className="py-2">
                    <p className="text-sm text-slate-800">{d.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatShortDate(d.decidedOn)}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  )
}
