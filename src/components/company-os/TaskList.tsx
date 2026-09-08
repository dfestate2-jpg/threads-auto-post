import Link from 'next/link'

import { AREA_ICON, AREA_LABEL, PRIORITY_CLASS, PRIORITY_LABEL, TASK_STATUS_LABEL, optionsOf } from '@/lib/company-os/labels'
import { formatDueLabel } from '@/lib/company-os/date'
import type { RankedTaskRow } from '@/lib/services/companyOs/tasks'
import { InlineSelect, ToggleDone } from './InlineSelect'
import { Badge, EmptyState } from './ui'

const STATUS_OPTIONS = optionsOf(TASK_STATUS_LABEL)

/**
 * タスクの一覧。
 *
 * 1行に「終わらせる操作・重さ・期限・担当・なぜ今か」を収める。
 * 詳細を開かないと分からない状態だと、朝の棚卸しが終わらない。
 */
export function TaskList({
  rows,
  now,
  emptyText = '該当するタスクはありません',
  emptyDescription,
  showProject = true,
  action,
}: {
  rows: RankedTaskRow[]
  now: Date
  emptyText?: string
  emptyDescription?: string
  showProject?: boolean
  action?: React.ReactNode
}) {
  if (rows.length === 0) {
    return <EmptyState icon="✅" title={emptyText} description={emptyDescription} action={action} />
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map(({ task, scored }) => {
        const source = task.source
        const overdue = scored.overdueDays > 0
        return (
          <li key={task.id} className="flex items-start gap-3 py-2.5">
            <div className="pt-0.5">
              <ToggleDone resource="tasks" id={task.id} status={task.status} ariaLabel={`${task.title}を完了にする`} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={`/company-os/tasks/${task.id}`}
                  className={`text-sm font-medium hover:underline ${
                    task.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-900'
                  }`}
                >
                  {task.title}
                </Link>
                <Badge className={PRIORITY_CLASS[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
                {scored.blocked ? (
                  <Badge className="border-slate-200 bg-slate-100 text-slate-500">着手できない</Badge>
                ) : null}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className={overdue ? 'font-semibold text-red-600' : ''}>
                  {formatDueLabel(task.dueOn, now)}
                </span>
                <span>
                  <span aria-hidden>{AREA_ICON[source.area]}</span> {AREA_LABEL[source.area]}
                </span>
                {showProject && source.project ? (
                  <Link href={`/company-os/projects/${source.project.id}`} className="hover:underline">
                    📁 {source.project.name}
                  </Link>
                ) : null}
                <span>{source.assignee ? `👤 ${source.assignee.name}` : '👤 担当未定'}</span>
                {source._count.checklist > 0 ? (
                  <span>
                    ☑ {source.checklist.filter((c) => c.done).length}/{source._count.checklist}
                  </span>
                ) : null}
                {source._count.comments > 0 ? <span>💬 {source._count.comments}</span> : null}
              </div>

              {scored.reasons.length > 0 ? (
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  優先度 {scored.score}：{scored.reasons.join('／')}
                </p>
              ) : null}
            </div>

            <div className="shrink-0">
              <InlineSelect
                resource="tasks"
                id={task.id}
                name="status"
                value={task.status}
                options={STATUS_OPTIONS}
                ariaLabel={`${task.title}のステータス`}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
