import Link from 'next/link'

import { TaskList } from '@/components/company-os/TaskList'
import { Badge, Card, EmptyState, PageHeader, ProgressBar, SectionCard, StatCard } from '@/components/company-os/ui'
import { analyze } from '@/lib/company-os/advisor'
import { formatShortDate } from '@/lib/company-os/date'
import {
  HEALTH_CLASS, HEALTH_LABEL,
} from '@/lib/company-os/progress'
import {
  ISSUE_STATUS_CLASS, ISSUE_STATUS_LABEL, QUESTION_STATUS_CLASS, QUESTION_STATUS_LABEL,
  SEVERITY_CLASS, SEVERITY_LABEL, STAGE_LABEL,
} from '@/lib/company-os/labels'
import { formatMetric, monthlyProfit } from '@/lib/company-os/metrics'
import { loadDashboard } from '@/lib/services/companyOs/dashboard'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { buildSnapshot } from '@/lib/services/companyOs/snapshot'
import type { CoIssueStatus, CoQuestionStatus, CoSeverity } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * 経営ダッシュボード。
 *
 * 開いた瞬間に「今日やること」「止まっているもの」「会社の数字」が分かることだけを目的にする。
 * 一覧を眺めさせる画面ではないので、各カードは必ず対応する画面へ飛べるようにしてある。
 */
export default async function CompanyOsDashboard() {
  const ctx = await requireCompanyPage()
  const now = new Date()
  const [data, snapshot] = await Promise.all([
    loadDashboard(ctx.company.id, ctx.role, now),
    buildSnapshot(ctx.company, ctx.role, now),
  ])
  const findings = analyze(snapshot)

  const revenue = data.metrics.find((m) => m.key === 'revenue_month')
  const expense = data.metrics.find((m) => m.key === 'expense_month')
  const profit = monthlyProfit(revenue?.value ?? null, expense?.value ?? null)

  return (
    <>
      <PageHeader
        title={ctx.company.name}
        description={
          ctx.company.vision ??
          `${STAGE_LABEL[ctx.company.stage]}。会社の状況と、いま手を付けるべきことをまとめています。`
        }
        action={
          <Link href="/company-os/tasks" className="btn-primary px-3 py-1.5 text-xs">
            タスク一覧へ
          </Link>
        }
      />

      {/* --- 今日やるべきこと。この画面で一番大きく出す --- */}
      <SectionCard
        className="mb-4 border-slate-300"
        title="🎯 今日の最重要 TOP5"
        hint="期限・重要度・他タスクへの影響・売上インパクト・リスクから算出しています"
        action={
          <Link href="/company-os/tasks?view=today" className="text-xs text-slate-500 hover:underline">
            今日のタスクをすべて見る →
          </Link>
        }
      >
        <TaskList
          rows={data.top}
          now={now}
          emptyText="今日やるべきタスクはありません"
          emptyDescription="未決事項を片付けるか、次の計画に時間を使えます。"
          action={
            <Link href="/company-os/questions" className="btn-secondary px-3 py-1.5 text-xs">
              未決事項を見る
            </Link>
          }
        />
      </SectionCard>

      {/* --- 状態のカード --- */}
      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="会社設立の進捗"
          value={`${data.founding.percent}%`}
          hint={`${data.founding.done}/${data.founding.total} 件完了`}
          tone={data.founding.percent >= 100 ? 'ok' : 'info'}
          href="/company-os/company/setup"
        />
        <StatCard
          label="期限超過"
          value={data.overdue.length}
          unit="件"
          tone={data.overdue.length > 0 ? 'danger' : 'ok'}
          hint={data.overdue.length > 0 ? '今すぐ対応' : '超過なし'}
          href="/company-os/tasks?view=overdue"
        />
        <StatCard label="今日" value={data.today.length} unit="件" href="/company-os/tasks?view=today" />
        <StatCard label="今週" value={data.week.length} unit="件" href="/company-os/tasks?view=week" />
        <StatCard label="進行中" value={data.inProgressCount} unit="件" href="/company-os/tasks" />
        <StatCard
          label="担当者未定"
          value={data.unassignedCount}
          unit="件"
          tone={data.unassignedCount > 0 ? 'warn' : 'neutral'}
          href="/company-os/tasks?group=assignee"
        />
        <StatCard
          label="経営課題"
          value={data.issues.total}
          unit="件"
          tone={data.issues.critical > 0 ? 'danger' : data.issues.total > 0 ? 'warn' : 'ok'}
          hint={data.issues.critical > 0 ? `重要 ${data.issues.critical}件` : undefined}
          href="/company-os/issues"
        />
        <StatCard
          label="未決事項"
          value={data.questions.total}
          unit="件"
          tone={data.questions.overdue > 0 ? 'warn' : 'neutral'}
          hint={data.questions.overdue > 0 ? `期限切れ ${data.questions.overdue}件` : undefined}
          href="/company-os/questions"
        />
        <StatCard label="進行中プロジェクト" value={data.projects.length} unit="件" href="/company-os/projects" />
        <StatCard
          label="遅延プロジェクト"
          value={data.delayedProjects.length}
          unit="件"
          tone={data.delayedProjects.length > 0 ? 'danger' : 'ok'}
          href="/company-os/projects?view=progress"
        />
        <StatCard label="会議ログ" value={data.meetingCount} unit="件" href="/company-os/meetings" />
        <StatCard label="未完了タスク" value={data.openTaskCount} unit="件" href="/company-os/tasks" />
      </section>

      {/* --- 経営数値 --- */}
      <SectionCard
        className="mb-4"
        title="💰 経営数値"
        hint="財務・営業の自動集計は Phase2 で接続します。それまでは KPI 画面から手で更新できます"
        action={
          <Link href="/company-os/management/kpi" className="text-xs text-slate-500 hover:underline">
            数値を更新する →
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {data.metrics.map((metric) => (
            <div key={metric.key} className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">{metric.label}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatMetric(metric.value, metric.unit)}
              </div>
              {metric.target !== null ? (
                <div className="mt-0.5 text-[11px] text-slate-400">目標 {formatMetric(metric.target, metric.unit)}</div>
              ) : null}
            </div>
          ))}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">今月の利益</div>
            <div
              className={`mt-1 text-lg font-bold tabular-nums ${
                profit === null ? 'text-slate-400' : profit < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {formatMetric(profit, '円')}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">売上 − 経費</div>
          </div>
        </div>
      </SectionCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* --- AI診断 --- */}
        <SectionCard
          title="🤖 AIによる経営診断"
          hint="会社のデータから、いま止まっているものを検出しています"
          action={
            <Link href="/company-os/ai" className="text-xs text-slate-500 hover:underline">
              質問する →
            </Link>
          }
        >
          <ul className="space-y-2">
            {findings.slice(0, 5).map((finding, index) => (
              <li key={index} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span aria-hidden className="text-sm">
                    {finding.level === 'CRITICAL' ? '🔴' : finding.level === 'WARN' ? '🟠' : finding.level === 'GOOD' ? '🟢' : '🔵'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{finding.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{finding.detail}</p>
                    {finding.href ? (
                      <Link href={finding.href} className="mt-1 inline-block text-xs text-slate-500 hover:underline">
                        対応する →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* --- プロジェクト --- */}
        <SectionCard
          title="📁 進行中のプロジェクト"
          action={
            <Link href="/company-os/projects" className="text-xs text-slate-500 hover:underline">
              すべて見る →
            </Link>
          }
        >
          {data.projects.length === 0 ? (
            <EmptyState
              icon="📁"
              title="プロジェクトがありません"
              description="会社立ち上げや会社買収など、大きな仕事の単位で作ります。"
              action={
                <Link href="/company-os/projects" className="btn-secondary px-3 py-1.5 text-xs">
                  プロジェクトを作る
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {data.projects.slice(0, 5).map((p) => (
                <li key={p.project.id}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/company-os/projects/${p.project.id}`}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      {p.project.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge className={HEALTH_CLASS[p.health]}>{HEALTH_LABEL[p.health]}</Badge>
                      <span className="text-xs tabular-nums text-slate-500">{p.progress.percent}%</span>
                    </div>
                  </div>
                  <ProgressBar
                    percent={p.progress.percent}
                    tone={p.health === 'DELAYED' ? 'danger' : p.health === 'AT_RISK' ? 'warn' : 'ok'}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    残り{p.openTaskCount}件
                    {p.overdueTaskCount > 0 ? `／期限超過${p.overdueTaskCount}件` : ''}
                    {p.project.dueOn ? `／期限 ${formatShortDate(p.project.dueOn)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* --- 経営課題 --- */}
        <SectionCard
          title="⚠️ 経営課題"
          action={
            <Link href="/company-os/issues" className="text-xs text-slate-500 hover:underline">
              すべて見る →
            </Link>
          }
        >
          {data.issues.rows.length === 0 ? (
            <EmptyState icon="🟢" title="未対応の課題はありません" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.issues.rows.map((issue) => (
                <li key={issue.id} className="flex items-center gap-2 py-2">
                  <Badge className={SEVERITY_CLASS[issue.severity as CoSeverity]}>
                    {SEVERITY_LABEL[issue.severity as CoSeverity]}
                  </Badge>
                  <Link href={`/company-os/issues/${issue.id}`} className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:underline">
                    {issue.title}
                  </Link>
                  <Badge className={ISSUE_STATUS_CLASS[issue.status as CoIssueStatus]}>
                    {ISSUE_STATUS_LABEL[issue.status as CoIssueStatus]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* --- 未決事項 --- */}
        <SectionCard
          title="❓ 未決事項"
          hint="決めていないことは、決めるまで毎日コストを生みます"
          action={
            <Link href="/company-os/questions" className="text-xs text-slate-500 hover:underline">
              すべて見る →
            </Link>
          }
        >
          {data.questions.rows.length === 0 ? (
            <EmptyState icon="🟢" title="未決事項はありません" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.questions.rows.map((q) => (
                <li key={q.id} className="flex items-center gap-2 py-2">
                  <Link href="/company-os/questions" className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:underline">
                    {q.title}
                  </Link>
                  {q.dueOn ? <span className="text-xs text-slate-400">{formatShortDate(q.dueOn)}</span> : null}
                  <Badge className={QUESTION_STATUS_CLASS[q.status as CoQuestionStatus]}>
                    {QUESTION_STATUS_LABEL[q.status as CoQuestionStatus]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* --- 重要な決定事項 --- */}
        <SectionCard
          title="📌 重要な決定事項"
          hint="「なぜそう決めたか」を残しておくと、あとで迷いません"
          action={
            <Link href="/company-os/decisions" className="text-xs text-slate-500 hover:underline">
              すべて見る →
            </Link>
          }
        >
          {data.decisions.length === 0 ? (
            <EmptyState
              icon="📌"
              title="重要な決定はまだ登録されていません"
              description="意思決定の画面で「重要」を付けると、ここに出ます。"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.decisions.map((d) => (
                <li key={d.id} className="py-2">
                  <p className="text-sm text-slate-800">{d.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatShortDate(d.decidedOn)}
                    {d.deciderName ? `・${d.deciderName}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* --- 期限が近い書類 --- */}
        <SectionCard
          title="📄 期限が近い書類"
          hint="許認可や契約の更新漏れは、あとから取り返せません"
          action={
            <Link href="/company-os/legal/deadlines" className="text-xs text-slate-500 hover:underline">
              すべて見る →
            </Link>
          }
        >
          {data.expiringDocuments.length === 0 ? (
            <EmptyState icon="🟢" title="30日以内に期限が来る書類はありません" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.expiringDocuments.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-sm text-slate-800">{doc.name}</span>
                  <span className="shrink-0 text-xs font-medium text-orange-600">{formatShortDate(doc.expiresOn)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <Card className="mt-4 p-4">
        <p className="text-xs leading-relaxed text-slate-500">
          このダッシュボードは、入力されたデータからその場で計算しています。
          数字が実態と違う場合は、元のタスク・課題・KPI を直せば次に開いたときに反映されます。
        </p>
      </Card>
    </>
  )
}
