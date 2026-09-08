import { RecordDialog } from '@/components/company-os/RecordDialog'
import { EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { canManageCompany } from '@/lib/company-os/access'
import { companyFields } from '@/lib/company-os/formSpecs'
import { toDateInput } from '@/lib/company-os/date'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * 会社目的。
 * 定款に書く事業目的は、後から変えると登記費用がかかる。
 * 「将来やるかもしれないこと」まで含めて書き溜める場所として用意している。
 */
export default async function CompanyPurposePage() {
  const ctx = await requireCompanyPage()
  const company = ctx.company

  const editButton = canManageCompany(ctx.role) ? (
    <RecordDialog
      label="編集"
      title="会社目的を編集"
      resource="companies"
      fields={companyFields()}
      record={{
        id: company.id,
        name: company.name,
        legalName: company.legalName,
        stage: company.stage,
        industry: company.industry,
        foundedOn: toDateInput(company.foundedOn),
        capital: company.capital === null ? '' : company.capital.toString(),
        fiscalMonth: company.fiscalMonth === null ? '' : String(company.fiscalMonth),
        corporateNumber: company.corporateNumber,
        address: company.address,
        phone: company.phone,
        website: company.website,
        vision: company.vision,
        purpose: company.purpose,
        notes: company.notes,
      }}
    />
  ) : null

  return (
    <>
      <PageHeader
        title="会社目的"
        description="定款の事業目的と、この会社が何のためにあるのかを書きます。"
        action={editButton}
      />

      <div className="space-y-4">
        <SectionCard title="何のための会社か" hint="ダッシュボードの一番上に表示されます">
          {company.vision ? (
            <p className="text-sm leading-relaxed text-slate-700">{company.vision}</p>
          ) : (
            <EmptyState icon="🧭" title="まだ書かれていません" description="一文で構いません。" action={editButton} />
          )}
        </SectionCard>

        <SectionCard
          title="事業目的（定款）"
          hint="登記後に変えると費用がかかります。将来やる可能性のある事業も入れておきます"
        >
          {company.purpose ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{company.purpose}</p>
          ) : (
            <EmptyState
              icon="📜"
              title="事業目的が未設定です"
              description="「1. ○○の企画、開発及び販売」のように箇条書きで書きます。"
              action={editButton}
            />
          )}
        </SectionCard>
      </div>
    </>
  )
}
