import { AiAssistant } from '@/components/company-os/AiAssistant'
import { Card, PageHeader } from '@/components/company-os/ui'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/** AI経営アシスタント。会社のデータを読んだうえで答える */
export default async function AiPage() {
  const ctx = await requireCompanyPage()

  return (
    <>
      <PageHeader
        title="AI経営アシスタント"
        description={`${ctx.company.name}のタスク・課題・決定事項・プロジェクト・会議・KPI を読み取って答えます。`}
      />

      <AiAssistant />

      <Card className="mt-4 p-4">
        <p className="text-xs leading-relaxed text-slate-500">
          いまはルールで判断しています（会社の情報は外部に送信されません）。
          Phase3 で言語モデルに置き換える際も、参照するデータの範囲と権限の扱いはこのままです。
          回答には必ず根拠となるタスクを添えているので、判断は最終的にご自身で行ってください。
        </p>
      </Card>
    </>
  )
}
