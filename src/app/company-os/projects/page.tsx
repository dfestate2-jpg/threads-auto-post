import Link from 'next/link'

import { RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, EmptyState, PageHeader, ProgressBar, SectionCard, Td, TableWrap, Th } from '@/components/company-os/ui'
import { formatDueLabel, formatShortDate } from '@/lib/company-os/date'
import { projectFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL, PRIORITY_CLASS, PRIORITY_LABEL, PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL } from '@/lib/company-os/labels'
import { HEALTH_CLASS, HEALTH_LABEL } from '@/lib/company-os/progress'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { listMilestones, listProjectSummaries } from '@/lib/services/companyOs/projects'
import { TemplateButtons } from '@/components/company-os/TemplateButtons'

export const dynamic = 'force-dynamic'

/**
 * プロジェクト一覧。
 * 「一覧」「進行状況」「マイルストーン」は同じデータの見せ方の切り替えにしている。
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireCompanyPage()
  const params = await searchParams
  const view = params.view ?? ''
  const area = params.area ?? ''
  const now = new Date()

  const [all, options, milestones] = await Promise.all([
    listProjectSummaries(ctx.company.id, now, undefined, { includeClosed: true }),
    loadFormOptions(ctx.company.id),
    listMilestones(ctx.company.id),
  ])
  const summaries = area ? all.filter((s) => s.project.area === area) : all

  return (
    <>
      <PageHeader
        title={area ? `${AREA_LABEL[area as keyof typeof AREA_LABEL] ?? area}のプロジェクト` : 'プロジェクト'}
        description="会社の大きな仕事を、進捗と遅れが見える形で管理します。"
        action={
          <RecordDialog
            label="＋ プロジェクトを作る"
            title="プロジェクトを作る"
            resource="projects"
            fields={projectFields(options)}
            record={{ status: 'PLANNING', priority: 'MEDIUM', area: 'OTHER' }}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {[
          { key: '', label: '一覧' },
          { key: 'progress', label: '進行状況' },
          { key: 'milestones', label: 'マイルストーン' },
        ].map((item) => (
          <Link
            key={item.key || 'all'}
            href={`/company-os/projects${item.key ? `?view=${item.key}` : ''}${area ? `${item.key ? '&' : '?'}area=${area}` : ''}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              view === item.key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {summaries.length === 0 ? (
        <EmptyState
          icon="📁"
          title="プロジェクトがありません"
          description="会社立ち上げや会社買収は、テンプレートから一式を作れます。"
          action={<TemplateButtons />}
        />
      ) : view === 'milestones' ? (
        <MilestoneTimeline milestones={milestones} now={now} />
      ) : view === 'progress' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {summaries.map((s) => (
            <SectionCard
              key={s.project.id}
              title={
                <Link href={`/company-os/projects/${s.project.id}`} className="hover:underline">
                  {s.project.name}
                </Link>
              }
              hint={s.project.dueOn ? `期限 ${formatShortDate(s.project.dueOn)}（${formatDueLabel(s.project.dueOn, now)}）` : '期限なし'}
              action={<Badge className={HEALTH_CLASS[s.health]}>{HEALTH_LABEL[s.health]}</Badge>}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums text-slate-900">{s.progress.percent}%</span>
                <span className="text-xs text-slate-500">
                  {s.progress.done}/{s.progress.total} 件完了
                </span>
              </div>
              <ProgressBar
                percent={s.progress.percent}
                tone={s.health === 'DELAYED' ? 'danger' : s.health === 'AT_RISK' ? 'warn' : 'ok'}
              />
              <p className="mt-2 text-xs text-slate-500">
                未完了 {s.openTaskCount}件
                {s.overdueTaskCount > 0 ? `／期限超過 ${s.overdueTaskCount}件` : ''}
                {s.openIssueCount > 0 ? `／課題 ${s.openIssueCount}件` : ''}
              </p>
            </SectionCard>
          ))}
        </div>
      ) : (
        <SectionCard title={`${summaries.length}件`} action={<TemplateButtons />}>
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>プロジェクト</Th>
                  <Th>状態</Th>
                  <Th>進捗</Th>
                  <Th>期限</Th>
                  <Th>責任者</Th>
                  <Th>タスク</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {summaries.map((s) => (
                  <tr key={s.project.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/company-os/projects/${s.project.id}`} className="font-medium text-slate-900 hover:underline">
                        {s.project.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <Badge className={PROJECT_STATUS_CLASS[s.project.status]}>
                          {PROJECT_STATUS_LABEL[s.project.status]}
                        </Badge>
                        <Badge className={PRIORITY_CLASS[s.project.priority]}>{PRIORITY_LABEL[s.project.priority]}</Badge>
                      </div>
                    </Td>
                    <Td>
                      <Badge className={HEALTH_CLASS[s.health]}>{HEALTH_LABEL[s.health]}</Badge>
                    </Td>
                    <Td className="w-40">
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          percent={s.progress.percent}
                          tone={s.health === 'DELAYED' ? 'danger' : s.health === 'AT_RISK' ? 'warn' : 'ok'}
                        />
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">
                          {s.progress.percent}%
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {s.project.dueOn ? formatShortDate(s.project.dueOn) : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{s.project.owner?.name ?? '未定'}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      残り{s.openTaskCount}
                      {s.overdueTaskCount > 0 ? <span className="ml-1 text-red-600">超過{s.overdueTaskCount}</span> : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>
      )}
    </>
  )
}

/**
 * マイルストーンのタイムライン。
 * ガントチャートは横スクロールが前提になって画面が読みにくいので、
 * まずは期限順に並べた縦のタイムラインにしている。
 */
function MilestoneTimeline({
  milestones,
  now,
}: {
  milestones: Awaited<ReturnType<typeof listMilestones>>
  now: Date
}) {
  if (milestones.length === 0) {
    return (
      <EmptyState
        icon="🚩"
        title="マイルストーンがありません"
        description="プロジェクトの詳細画面から、節目を追加できます。"
      />
    )
  }

  return (
    <SectionCard title="マイルストーン" hint="期限が近い順に並べています">
      <ol className="relative space-y-4 border-l border-slate-200 pl-5">
        {milestones.map((m) => (
          <li key={m.id} className="relative">
            <span
              className={`absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white ${
                m.done ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${m.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                {m.name}
              </span>
              <Link href={`/company-os/projects/${m.project.id}`} className="text-xs text-slate-500 hover:underline">
                {m.project.name}
              </Link>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {m.dueOn ? `${formatShortDate(m.dueOn)}（${formatDueLabel(m.dueOn, now)}）` : '期限なし'}
              {m.done ? '・達成' : ''}
            </p>
          </li>
        ))}
      </ol>
    </SectionCard>
  )
}
