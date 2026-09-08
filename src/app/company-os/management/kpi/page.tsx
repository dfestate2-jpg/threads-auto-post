import { MetricInput } from '@/components/company-os/MetricInput'
import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, Card, EmptyState, PageHeader, ProgressBar, SectionCard, TableWrap, Td, Th } from '@/components/company-os/ui'
import { formatShortDate, toDateInput } from '@/lib/company-os/date'
import { objectiveFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL, OBJECTIVE_STATUS_CLASS, OBJECTIVE_STATUS_LABEL } from '@/lib/company-os/labels'
import { achievementRate, listObjectives } from '@/lib/services/companyOs/management'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * KPI。
 *
 * ダッシュボードの経営数値（売上・経費・キャッシュ・商談・顧客・契約）は
 * ここに実データとして入る。財務モジュールが入ったら、同じ行を自動更新すればよい。
 */
export default async function KpiPage() {
  const ctx = await requireCompanyPage()
  const [objectives, options] = await Promise.all([
    listObjectives(ctx.company.id, { isKpi: true }),
    loadFormOptions(ctx.company.id),
  ])

  const dashboardMetrics = objectives.filter((o) => o.metricKey !== null)
  const others = objectives.filter((o) => o.metricKey === null)

  const addButton = (
    <RecordDialog
      label="＋ KPIを追加"
      title="KPIを追加"
      resource="objectives"
      fields={objectiveFields(options)}
      record={{ isKpi: true, status: 'ON_TRACK', area: 'MANAGEMENT' }}
    />
  )

  return (
    <>
      <PageHeader
        title="KPI"
        description="数値で追う指標です。ダッシュボードの経営数値もここから更新します。"
        action={addButton}
      />

      <SectionCard
        className="mb-4"
        title="ダッシュボードの経営数値"
        hint="数字を打って入力欄から離れると保存されます。財務・営業の自動集計は Phase2 で接続します"
      >
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>指標</Th>
                <Th className="text-right">現在値</Th>
                <Th className="text-right">目標値</Th>
                <Th className="text-right">達成率</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dashboardMetrics.map((metric) => {
                const rate = achievementRate(metric.targetValue, metric.currentValue)
                return (
                  <tr key={metric.id}>
                    <Td>
                      <span className="font-medium text-slate-900">{metric.title}</span>
                      {metric.description ? (
                        <div className="text-xs text-slate-400">{metric.description}</div>
                      ) : null}
                    </Td>
                    <Td className="text-right">
                      <MetricInput
                        objectiveId={metric.id}
                        field="currentValue"
                        value={metric.currentValue}
                        unit={metric.unit}
                        ariaLabel={`${metric.title}の現在値`}
                      />
                    </Td>
                    <Td className="text-right">
                      <MetricInput
                        objectiveId={metric.id}
                        field="targetValue"
                        value={metric.targetValue}
                        unit={metric.unit}
                        ariaLabel={`${metric.title}の目標値`}
                      />
                    </Td>
                    <Td className="w-32 text-right">
                      {rate === null ? (
                        <span className="text-xs text-slate-400">目標未設定</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={rate} tone={rate >= 100 ? 'ok' : rate >= 70 ? 'warn' : 'danger'} />
                          <span className="w-12 shrink-0 text-xs tabular-nums">{rate}%</span>
                        </div>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </SectionCard>

      <SectionCard title={`その他のKPI（${others.length}件）`} action={addButton}>
        {others.length === 0 ? (
          <EmptyState
            icon="📈"
            title="追加のKPIはありません"
            description="商談化率、解約率、平均単価など、会社に固有の指標を足せます。"
            action={addButton}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {others.map((o) => {
              const rate = achievementRate(o.targetValue, o.currentValue)
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{o.title}</span>
                      <Badge className={OBJECTIVE_STATUS_CLASS[o.status]}>{OBJECTIVE_STATUS_LABEL[o.status]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {AREA_LABEL[o.area]}
                      {o.periodLabel ? `・${o.periodLabel}` : ''}
                      {o.dueOn ? `・期限 ${formatShortDate(o.dueOn)}` : ''}
                      {o.owner ? `・${o.owner.name}` : ''}
                    </p>
                  </div>
                  <MetricInput
                    objectiveId={o.id}
                    field="currentValue"
                    value={o.currentValue}
                    unit={o.unit}
                    ariaLabel={`${o.title}の現在値`}
                  />
                  <span className="w-16 text-right text-sm tabular-nums text-slate-500">
                    {rate === null ? '—' : `${rate}%`}
                  </span>
                  <span className="inline-flex items-center gap-3">
                    <RecordDialog
                      label="編集"
                      title="KPIを編集"
                      resource="objectives"
                      variant="link"
                      fields={objectiveFields(options)}
                      record={{
                        id: o.id,
                        title: o.title,
                        description: o.description,
                        isKpi: o.isKpi,
                        targetValue: o.targetValue === null ? '' : String(o.targetValue),
                        currentValue: o.currentValue === null ? '' : String(o.currentValue),
                        unit: o.unit,
                        status: o.status,
                        area: o.area,
                        periodLabel: o.periodLabel,
                        dueOn: toDateInput(o.dueOn),
                        ownerId: o.ownerId,
                      }}
                    />
                    <DeleteButton resource="objectives" id={o.id} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      <Card className="mt-4 p-4">
        <p className="text-xs leading-relaxed text-slate-500">
          ダッシュボードの経営数値は、この表の値をそのまま表示しています。
          会計ソフトや営業CRMとの連携（Phase2）が入ったら、同じ行が自動で更新されるようになります。
        </p>
      </Card>
    </>
  )
}
