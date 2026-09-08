import Link from 'next/link'

import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, EmptyState, PageHeader, SectionCard, TableWrap, Td, Th } from '@/components/company-os/ui'
import { daysUntilDue, formatShortDate, toDateInput } from '@/lib/company-os/date'
import { documentFields } from '@/lib/company-os/formSpecs'
import { AREA_LABEL, VISIBILITY_LABEL } from '@/lib/company-os/labels'
import { listDocuments } from '@/lib/services/companyOs/company'
import { loadFormOptions } from '@/lib/services/companyOs/options'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * 重要書類。
 * 実体（PDFなど）はここに置かず、置き場所と期限だけを持つ。
 * 「どこにあるか分からない」「更新期限を過ぎていた」を防ぐのが目的。
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireCompanyPage()
  const params = await searchParams
  const area = params.area ?? ''
  const now = new Date()

  const [documents, options] = await Promise.all([
    listDocuments(ctx.company.id, ctx.role, { area: area || undefined }),
    loadFormOptions(ctx.company.id),
  ])

  const addButton = (
    <RecordDialog
      label="＋ 書類を登録"
      title="書類を登録"
      resource="documents"
      fields={documentFields(options)}
      record={{ area: area || 'COMPANY', visibility: 'ALL' }}
    />
  )

  return (
    <>
      <PageHeader
        title={area ? `${AREA_LABEL[area as keyof typeof AREA_LABEL] ?? area}の書類` : '重要書類'}
        description="定款・登記簿・契約書・許認可の置き場所と期限をまとめます。ファイルそのものは外部のストレージに置いてください。"
        action={addButton}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/company-os/company/documents"
          className={`rounded-full px-3 py-1 text-xs font-medium ${!area ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          すべて
        </Link>
        {(['COMPANY', 'LEGAL', 'FINANCE', 'SALES', 'SUBSIDY', 'MA'] as const).map((key) => (
          <Link
            key={key}
            href={`/company-os/company/documents?area=${key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${area === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {AREA_LABEL[key]}
          </Link>
        ))}
      </div>

      {documents.length === 0 ? (
        <EmptyState icon="📄" title="登録されている書類はありません" action={addButton} />
      ) : (
        <SectionCard title={`${documents.length}件`}>
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>書類名</Th>
                  <Th>分類</Th>
                  <Th>保管場所</Th>
                  <Th>期限</Th>
                  <Th>公開範囲</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {documents.map((doc) => {
                  const days = daysUntilDue(doc.expiresOn, now)
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <Td>
                        <span className="font-medium text-slate-900">{doc.name}</span>
                        {doc.note ? <div className="text-xs text-slate-400">{doc.note}</div> : null}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">{AREA_LABEL[doc.area]}</Td>
                      <Td className="max-w-xs truncate text-xs">
                        {doc.location ? (
                          doc.location.startsWith('http') ? (
                            <a href={doc.location} target="_blank" rel="noopener noreferrer" className="underline">
                              {doc.location}
                            </a>
                          ) : (
                            doc.location
                          )
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {doc.expiresOn ? (
                          <span className={days !== null && days <= 30 ? 'font-semibold text-orange-600' : ''}>
                            {formatShortDate(doc.expiresOn)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {doc.visibility === 'ALL' ? (
                          <span className="text-xs text-slate-400">全員</span>
                        ) : (
                          <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                            {VISIBILITY_LABEL[doc.visibility]}
                          </Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-3">
                          <RecordDialog
                            label="編集"
                            title="書類を編集"
                            resource="documents"
                            variant="link"
                            fields={documentFields(options)}
                            record={{
                              id: doc.id,
                              name: doc.name,
                              location: doc.location,
                              area: doc.area,
                              expiresOn: toDateInput(doc.expiresOn),
                              projectId: doc.projectId,
                              visibility: doc.visibility,
                              note: doc.note,
                            }}
                          />
                          <DeleteButton resource="documents" id={doc.id} />
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>
      )}
    </>
  )
}
