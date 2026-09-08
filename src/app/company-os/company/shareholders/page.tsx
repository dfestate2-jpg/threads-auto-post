import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { Card, EmptyState, PageHeader, SectionCard, TableWrap, Td, Th } from '@/components/company-os/ui'
import { canManageCompany } from '@/lib/company-os/access'
import { shareholderFields } from '@/lib/company-os/formSpecs'
import { listShareholders } from '@/lib/services/companyOs/company'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * 株主。
 * 出資比率は後から変えるのが最も難しい。合計が100%かどうかを常に見せて、
 * 決め忘れ・書き漏れに気づけるようにしている。
 */
export default async function ShareholdersPage() {
  const ctx = await requireCompanyPage()
  const shareholders = await listShareholders(ctx.company.id)
  const canManage = canManageCompany(ctx.role)

  const totalRatio = shareholders.reduce((sum, s) => sum + (s.ratio ?? 0), 0)
  const totalShares = shareholders.reduce((sum, s) => sum + (s.shares ?? 0), 0)
  const totalAmount = shareholders.reduce((sum, s) => sum + (s.amount ?? 0n), 0n)

  const addButton = canManage ? (
    <RecordDialog
      label="＋ 株主を追加"
      title="株主を追加"
      resource="shareholders"
      fields={shareholderFields()}
      record={{ isCompany: false }}
    />
  ) : null

  return (
    <>
      <PageHeader
        title="株主"
        description="出資比率は後から変えるのが最も難しい項目です。最初にきちんと決めて残します。"
        action={addButton}
      />

      {shareholders.length === 0 ? (
        <EmptyState icon="📊" title="株主が登録されていません" action={addButton} />
      ) : (
        <>
          {Math.abs(totalRatio - 100) > 0.01 ? (
            <Card className="mb-4 border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                出資比率の合計が {totalRatio}% です。100% になるように確認してください。
              </p>
            </Card>
          ) : null}

          <SectionCard title={`${shareholders.length}名`}>
            <TableWrap>
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <Th>株主</Th>
                    <Th className="text-right">株式数</Th>
                    <Th className="text-right">比率</Th>
                    <Th className="text-right">出資額</Th>
                    <Th>メモ</Th>
                    {canManage ? <Th /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shareholders.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <Td>
                        <span className="font-medium text-slate-900">{s.name}</span>
                        <span className="ml-2 text-xs text-slate-400">{s.isCompany ? '法人' : '個人'}</span>
                      </Td>
                      <Td className="text-right tabular-nums">{s.shares?.toLocaleString('ja-JP') ?? '—'}</Td>
                      <Td className="text-right tabular-nums">{s.ratio === null ? '—' : `${s.ratio}%`}</Td>
                      <Td className="text-right tabular-nums">
                        {s.amount === null ? '—' : `${s.amount.toLocaleString('ja-JP')}円`}
                      </Td>
                      <Td className="text-xs text-slate-500">{s.note ?? '—'}</Td>
                      {canManage ? (
                        <Td className="whitespace-nowrap text-right">
                          <span className="inline-flex items-center gap-3">
                            <RecordDialog
                              label="編集"
                              title="株主を編集"
                              resource="shareholders"
                              variant="link"
                              fields={shareholderFields()}
                              record={{
                                id: s.id,
                                name: s.name,
                                isCompany: s.isCompany,
                                shares: s.shares === null ? '' : String(s.shares),
                                ratio: s.ratio === null ? '' : String(s.ratio),
                                amount: s.amount === null ? '' : s.amount.toString(),
                                note: s.note,
                              }}
                            />
                            <DeleteButton resource="shareholders" id={s.id} />
                          </span>
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <Td className="font-medium">合計</Td>
                    <Td className="text-right font-medium tabular-nums">{totalShares.toLocaleString('ja-JP')}</Td>
                    <Td className="text-right font-medium tabular-nums">{totalRatio}%</Td>
                    <Td className="text-right font-medium tabular-nums">{totalAmount.toLocaleString('ja-JP')}円</Td>
                    <Td />
                    {canManage ? <Td /> : null}
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </SectionCard>
        </>
      )}
    </>
  )
}
