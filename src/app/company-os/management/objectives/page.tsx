import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, EmptyState, PageHeader, ProgressBar, SectionCard } from '@/components/company-os/ui'
import { formatDueLabel, formatShortDate, toDateInput } from '@/lib/company-os/date'
import { objectiveFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL, OBJECTIVE_STATUS_CLASS, OBJECTIVE_STATUS_LABEL } from '@/lib/company-os/labels'
import { achievementRate, listObjectives } from '@/lib/services/companyOs/management'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/** 経営目標。数値で追うものは KPI 画面にも並ぶ */
export default async function ObjectivesPage() {
  const ctx = await requireCompanyPage()
  const now = new Date()
  const [objectives, options] = await Promise.all([
    listObjectives(ctx.company.id),
    loadFormOptions(ctx.company.id),
  ])
  const rows = objectives.filter((o) => o.metricKey === null)

  const addButton = (
    <RecordDialog
      label="＋ 目標を追加"
      title="経営目標を追加"
      resource="objectives"
      fields={objectiveFields(options)}
      record={{ isKpi: false, status: 'ON_TRACK', area: 'MANAGEMENT' }}
    />
  )

  return (
    <>
      <PageHeader
        title="経営目標"
        description="この会社がいつまでに何を達成するか。数値で追うものは KPI 画面にも並びます。"
        action={addButton}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="経営目標が登録されていません"
          description="「初年度で顧客10社」「半年以内に黒字化」のように、期限つきで書きます。"
          action={addButton}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((o) => {
            const rate = achievementRate(o.targetValue, o.currentValue)
            return (
              <SectionCard
                key={o.id}
                title={o.title}
                hint={[
                  AREA_LABEL[o.area],
                  o.periodLabel ?? null,
                  o.dueOn ? `期限 ${formatShortDate(o.dueOn)}（${formatDueLabel(o.dueOn, now)}）` : '期限なし',
                  o.owner ? `担当 ${o.owner.name}` : '担当未定',
                ]
                  .filter(Boolean)
                  .join('・')}
                action={
                  <div className="flex items-center gap-3">
                    <Badge className={OBJECTIVE_STATUS_CLASS[o.status]}>{OBJECTIVE_STATUS_LABEL[o.status]}</Badge>
                    <RecordDialog
                      label="編集"
                      title="経営目標を編集"
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
                  </div>
                }
              >
                {o.description ? (
                  <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{o.description}</p>
                ) : null}
                {rate !== null ? (
                  <div>
                    <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
                      <span>
                        {o.currentValue?.toLocaleString('ja-JP') ?? 0}
                        {o.unit ?? ''} / {o.targetValue?.toLocaleString('ja-JP')}
                        {o.unit ?? ''}
                      </span>
                      <span className="tabular-nums">{rate}%</span>
                    </div>
                    <ProgressBar percent={rate} tone={rate >= 100 ? 'ok' : rate >= 70 ? 'warn' : 'danger'} />
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">数値目標は設定されていません（定性目標）。</p>
                )}
              </SectionCard>
            )
          })}
        </div>
      )}
    </>
  )
}
