import Link from 'next/link'

import { RecordDialog } from '@/components/company-os/RecordDialog'
import { TaskList } from '@/components/company-os/TaskList'
import { EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { daysUntilDue } from '@/lib/company-os/date'
import { taskFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL } from '@/lib/company-os/labels'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { listRankedTasks, type RankedTaskRow } from '@/lib/services/companyOs/tasks'

export const dynamic = 'force-dynamic'

type Search = Record<string, string | undefined>

const VIEWS = [
  { key: '', label: 'すべて' },
  { key: 'today', label: '今日' },
  { key: 'week', label: '今週' },
  { key: 'overdue', label: '期限超過' },
  { key: 'done', label: '完了済み' },
]

const GROUPS = [
  { key: '', label: 'まとめない' },
  { key: 'assignee', label: '担当者別' },
  { key: 'project', label: 'プロジェクト別' },
  { key: 'area', label: 'カテゴリー別' },
]

/**
 * タスク一覧。
 *
 * 「今日」「今週」「期限超過」「担当者別」「プロジェクト別」は、
 * 別の画面ではなく同じ一覧の見え方の切り替えとして作っている。
 * 画面ごとに絞り込みの定義がずれると、件数が食い違って信用されなくなる。
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireCompanyPage()
  const params = await searchParams
  const now = new Date()

  const view = params.view ?? ''
  const group = params.group ?? ''
  const area = params.area ?? ''

  const [rows, options] = await Promise.all([
    listRankedTasks(
      ctx.company.id,
      {
        area: area || undefined,
        projectId: params.project,
        assigneeId: params.assignee,
        q: params.q,
        includeClosed: view === 'done',
        status: view === 'done' ? ['DONE'] : undefined,
      },
      now,
      undefined,
    ),
    loadFormOptions(ctx.company.id),
  ])

  const filtered = applyView(rows, view, now)
  const groups = groupRows(filtered, group)

  const title = area ? `${AREA_LABEL[area as keyof typeof AREA_LABEL] ?? area}のタスク` : 'タスク'

  return (
    <>
      <PageHeader
        title={title}
        description={`${filtered.length}件。優先順位は期限・重要度・依存・売上・リスクから自動で計算しています。`}
        action={
          <RecordDialog
            label="＋ タスクを追加"
            title="タスクを追加"
            resource="tasks"
            fields={taskFields(options)}
            record={{ status: 'TODO', priority: 'MEDIUM', area: 'OTHER', revenueImpact: '0', riskImpact: '0' }}
          />
        }
      />

      <div className="mb-4 flex flex-wrap gap-4">
        <FilterRow label="表示" current={view} param="view" items={VIEWS} params={params} />
        <FilterRow label="まとめ" current={group} param="group" items={GROUPS} params={params} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="✅"
          title="該当するタスクはありません"
          description={
            view === 'overdue'
              ? '期限を過ぎたタスクはありません。'
              : 'フィルターを外すか、タスクを追加してください。'
          }
          action={
            <Link href="/company-os/tasks" className="btn-secondary px-3 py-1.5 text-xs">
              すべてのタスクを見る
            </Link>
          }
        />
      ) : group === '' ? (
        <SectionCard title={`${filtered.length}件`}>
          <TaskList rows={filtered} now={now} />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {groups.map(([label, items]) => (
            <SectionCard key={label} title={`${label}（${items.length}件）`}>
              <TaskList rows={items} now={now} showProject={group !== 'project'} />
            </SectionCard>
          ))}
        </div>
      )}
    </>
  )
}

/** 期限による絞り込み。ダッシュボードのカードと同じ定義を使う */
function applyView(rows: RankedTaskRow[], view: string, now: Date): RankedTaskRow[] {
  if (view === 'done') return rows
  const open = rows.filter((r) => r.task.status !== 'DONE' && r.task.status !== 'CANCELED')
  if (view === 'overdue') return open.filter((r) => r.scored.overdueDays > 0)
  if (view === 'today') {
    return open.filter((r) => {
      const days = daysUntilDue(r.task.dueOn, now)
      return days !== null && days <= 0
    })
  }
  if (view === 'week') {
    return open.filter((r) => {
      const days = daysUntilDue(r.task.dueOn, now)
      return days !== null && days <= 6
    })
  }
  return open
}

function groupRows(rows: RankedTaskRow[], group: string): [string, RankedTaskRow[]][] {
  if (group === '') return [['すべて', rows]]

  const map = new Map<string, RankedTaskRow[]>()
  for (const row of rows) {
    const key =
      group === 'assignee'
        ? (row.task.source.assignee?.name ?? '担当者未定')
        : group === 'project'
          ? (row.task.source.project?.name ?? 'プロジェクトなし')
          : AREA_LABEL[row.task.source.area]
    const list = map.get(key) ?? []
    list.push(row)
    map.set(key, list)
  }
  // 件数の多い順。最後に「未定」系を回すと、抜けが目立たなくなるため先頭に寄せる
  return [...map.entries()].sort((a, b) => {
    const aUnset = a[0].includes('未定') || a[0].includes('なし')
    const bUnset = b[0].includes('未定') || b[0].includes('なし')
    if (aUnset !== bUnset) return aUnset ? -1 : 1
    return b[1].length - a[1].length
  })
}

function FilterRow({
  label,
  current,
  param,
  items,
  params,
}: {
  label: string
  current: string
  param: string
  items: { key: string; label: string }[]
  params: Search
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {items.map((item) => {
        const next = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
          if (value && key !== param) next.set(key, value)
        }
        if (item.key) next.set(param, item.key)
        const query = next.toString()
        const active = current === item.key
        return (
          <Link
            key={item.key || 'all'}
            href={`/company-os/tasks${query ? `?${query}` : ''}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              active ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

export const metadata = { title: 'タスク｜Company OS' }
