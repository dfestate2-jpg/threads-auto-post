/**
 * ダッシュボードの経営数値。
 *
 * 財務モジュールと営業CRM（Phase2）が入るまで、売上・経費・キャッシュ・
 * 商談数などの自動集計元は無い。だからといって空欄やダミーを出すと、
 * 経営者はダッシュボードを信用しなくなる。
 *
 * そこで Phase1 では「経営者が自分で入れて、いつでも直せる数値」として扱い、
 * KPI（CoObjective）の1レコードに実データとして保存する。
 * Phase2 で自動集計に切り替えるときは、同じ metricKey に値を書き込めばよく、
 * 画面は変更しなくて済む。
 */
export interface MetricDef {
  key: string
  label: string
  unit: string
  /** 数値が大きいほど良いか。経費だけは逆 */
  higherIsBetter: boolean
  hint: string
}

export const DASHBOARD_METRICS: MetricDef[] = [
  { key: 'revenue_month', label: '今月の売上', unit: '円', higherIsBetter: true, hint: '当月に計上した売上' },
  { key: 'expense_month', label: '今月の経費', unit: '円', higherIsBetter: false, hint: '当月に発生した経費' },
  { key: 'cash_balance', label: 'キャッシュ残高', unit: '円', higherIsBetter: true, hint: '法人口座の残高合計' },
  { key: 'deals', label: '商談数', unit: '件', higherIsBetter: true, hint: '進行中の商談' },
  { key: 'customers', label: '顧客数', unit: '社', higherIsBetter: true, hint: '取引中の顧客' },
  { key: 'contracts', label: '契約数', unit: '件', higherIsBetter: true, hint: '締結済みの契約' },
]

export function findMetric(key: string): MetricDef | null {
  return DASHBOARD_METRICS.find((m) => m.key === key) ?? null
}

/** 円は3桁区切り、大きい額は「万円」「億円」に丸めて読みやすくする */
export function formatMetric(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return '—'
  if (unit !== '円') return `${value.toLocaleString('ja-JP')}${unit}`
  const abs = Math.abs(value)
  if (abs >= 100_000_000) return `${trimZero(value / 100_000_000)}億円`
  if (abs >= 10_000) return `${trimZero(value / 10_000)}万円`
  return `${value.toLocaleString('ja-JP')}円`
}

function trimZero(value: number): string {
  return Number(value.toFixed(1)).toLocaleString('ja-JP')
}

/** 今月の粗利（売上 − 経費）。どちらか欠けていたら出さない */
export function monthlyProfit(revenue: number | null, expense: number | null): number | null {
  if (revenue === null || expense === null) return null
  return revenue - expense
}
