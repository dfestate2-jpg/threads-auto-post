import Link from 'next/link'

import { RecordDialog } from '@/components/company-os/RecordDialog'
import { TaskList } from '@/components/company-os/TaskList'
import { TemplateButtons } from '@/components/company-os/TemplateButtons'
import { Card, EmptyState, PageHeader, ProgressBar, SectionCard, StatCard } from '@/components/company-os/ui'
import { taskFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL } from '@/lib/company-os/labels'
import { taskProgress } from '@/lib/company-os/progress'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { listRankedTasks } from '@/lib/services/companyOs/tasks'
import type { CoArea } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** 設立に必要な領域。この順に進むと、会社が動き始める */
const SETUP_AREAS: CoArea[] = ['COMPANY', 'LEGAL', 'FINANCE', 'MANAGEMENT', 'BUSINESS', 'SALES', 'DEVELOPMENT', 'SUBSIDY', 'CUSTOMER', 'HR']

/**
 * 設立タスク。
 *
 * 会社を作る段階では、やることの多さより「順番」が分からないことが問題になる。
 * 領域ごとに並べ、依存関係で着手できないものは一覧側で印を付ける。
 */
export default async function CompanySetupPage() {
  const ctx = await requireCompanyPage()
  const now = new Date()

  const [rows, options] = await Promise.all([
    listRankedTasks(ctx.company.id, { includeClosed: true }, now),
    loadFormOptions(ctx.company.id),
  ])

  const setupRows = rows.filter((r) => SETUP_AREAS.includes(r.task.source.area))
  const progress = taskProgress(setupRows.map((r) => r.task.status))
  const overdue = setupRows.filter((r) => r.scored.overdueDays > 0).length
  const blocked = setupRows.filter((r) => r.scored.blocked && r.task.status !== 'DONE').length

  const byArea = SETUP_AREAS.map((area) => ({
    area,
    rows: setupRows.filter((r) => r.task.source.area === area),
  })).filter((group) => group.rows.length > 0)

  return (
    <>
      <PageHeader
        title="設立タスク"
        description="会社設計から初回契約までを、領域ごとに並べています。順番は依存関係で決まります。"
        action={
          <RecordDialog
            label="＋ タスクを追加"
            title="設立タスクを追加"
            resource="tasks"
            fields={taskFields(options)}
            record={{ status: 'TODO', priority: 'HIGH', area: 'COMPANY', revenueImpact: '0', riskImpact: '0' }}
          />
        }
      />

      {setupRows.length === 0 ? (
        <EmptyState
          icon="🚀"
          title="設立タスクがまだありません"
          description="テンプレートから、会社設計・法務・経営・営業・開発・補助金・顧客のタスクを一括で作れます。"
          action={<TemplateButtons />}
        />
      ) : (
        <>
          <Card className="mb-4 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-700">設立の進捗</span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">{progress.percent}%</span>
            </div>
            <ProgressBar percent={progress.percent} tone={overdue > 0 ? 'warn' : 'ok'} />
            <p className="mt-2 text-xs text-slate-500">
              {progress.done}/{progress.total} 件完了
              {overdue > 0 ? `／期限超過 ${overdue}件` : ''}
              {blocked > 0 ? `／先行待ち ${blocked}件` : ''}
            </p>
          </Card>

          <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="完了" value={progress.done} unit="件" tone="ok" />
            <StatCard label="残り" value={progress.total - progress.done} unit="件" />
            <StatCard label="期限超過" value={overdue} unit="件" tone={overdue > 0 ? 'danger' : 'neutral'} />
            <StatCard label="先行待ち" value={blocked} unit="件" hint="前のタスクが終われば動きます" />
          </section>

          <div className="space-y-4">
            {byArea.map((group) => (
              <SectionCard key={group.area} title={`${AREA_LABEL[group.area]}（${group.rows.length}件）`}>
                <TaskList rows={group.rows} now={now} showProject={false} />
              </SectionCard>
            ))}
          </div>

          <Card className="mt-4 p-4">
            <p className="text-xs leading-relaxed text-slate-500">
              テンプレートを追加で流し込むこともできます（作成済みのタスクは重複しません）。
              <Link href="/company-os/projects" className="ml-1 underline underline-offset-2">
                プロジェクト一覧
              </Link>
              から実行してください。
            </p>
          </Card>
        </>
      )}
    </>
  )
}
