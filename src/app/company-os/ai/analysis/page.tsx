import Link from 'next/link'

import { Card, PageHeader, SectionCard, StatCard } from '@/components/company-os/ui'
import { analyze, type FindingLevel } from '@/lib/company-os/advisor'
import { requireCompanyPage } from '@/lib/services/companyOs/page'
import { buildSnapshot } from '@/lib/services/companyOs/snapshot'

export const dynamic = 'force-dynamic'

const LEVEL_STYLE: Record<FindingLevel, { icon: string; label: string; className: string }> = {
  CRITICAL: { icon: '🔴', label: '今すぐ', className: 'border-red-200 bg-red-50' },
  WARN: { icon: '🟠', label: '注意', className: 'border-orange-200 bg-orange-50' },
  INFO: { icon: '🔵', label: '確認', className: 'border-blue-200 bg-blue-50' },
  GOOD: { icon: '🟢', label: '良好', className: 'border-emerald-200 bg-emerald-50' },
}

/**
 * AI分析。
 * ダッシュボードに出している診断を、根拠と一緒に全件並べる画面。
 */
export default async function AiAnalysisPage() {
  const ctx = await requireCompanyPage()
  const now = new Date()
  const snapshot = await buildSnapshot(ctx.company, ctx.role, now)
  const findings = analyze(snapshot)

  const counts = {
    CRITICAL: findings.filter((f) => f.level === 'CRITICAL').length,
    WARN: findings.filter((f) => f.level === 'WARN').length,
    INFO: findings.filter((f) => f.level === 'INFO').length,
  }

  return (
    <>
      <PageHeader
        title="AI分析"
        description={`${ctx.company.name}のデータから、止まっているもの・危ないものを検出しています。`}
      />

      <section className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="今すぐ対応" value={counts.CRITICAL} unit="件" tone={counts.CRITICAL > 0 ? 'danger' : 'ok'} />
        <StatCard label="注意" value={counts.WARN} unit="件" tone={counts.WARN > 0 ? 'warn' : 'neutral'} />
        <StatCard label="確認" value={counts.INFO} unit="件" />
      </section>

      <div className="space-y-3">
        {findings.map((finding, index) => {
          const style = LEVEL_STYLE[finding.level]
          return (
            <div key={index} className={`rounded-xl border p-4 ${style.className}`}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="text-lg">
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{finding.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{finding.detail}</p>
                  {finding.href ? (
                    <Link href={finding.href} className="mt-2 inline-block text-xs font-medium text-slate-600 underline underline-offset-2">
                      対応する画面を開く →
                    </Link>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {style.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <SectionCard className="mt-4" title="分析に使ったデータ">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <Row label="未完了タスク" value={`${snapshot.tasks.length}件`} />
          <Row label="うち期限超過" value={`${snapshot.tasks.filter((t) => t.overdueDays > 0).length}件`} />
          <Row label="プロジェクト" value={`${snapshot.projects.length}件`} />
          <Row label="未解決の課題" value={`${snapshot.issues.length}件`} />
          <Row label="未決事項" value={`${snapshot.questions.length}件`} />
          <Row label="記録済みの決定" value={`${snapshot.decisionCount}件`} />
          <Row label="会議ログ" value={`${snapshot.meetingCount}件`} />
          <Row label="設立の進捗" value={`${snapshot.foundingPercent}%`} />
        </dl>
      </SectionCard>

      <Card className="mt-4 p-4">
        <p className="text-xs leading-relaxed text-slate-500">
          判定はすべてルールで行っており、外部への送信はありません。
          しきい値（期限超過の件数、キャッシュの残月数など）は今後、会社ごとに調整できるようにします。
        </p>
      </Card>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-1.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-slate-800">{value}</dd>
    </div>
  )
}
