import Link from 'next/link'

import { RecordDialog } from '@/components/company-os/RecordDialog'
import { Card, DefRow, PageHeader, SectionCard, StatCard } from '@/components/company-os/ui'
import { formatShortDate, toDateInput } from '@/lib/company-os/date'
import { companyFields } from '@/lib/company-os/formSpecs'
import { STAGE_LABEL } from '@/lib/company-os/labels'
import { canManageCompany } from '@/lib/company-os/access'
import { listMembers, listShareholders } from '@/lib/services/companyOs/company'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/** 会社の基本情報。登記・口座・補助金の申請でそのまま使う値を1か所に置く */
export default async function CompanyPage() {
  const ctx = await requireCompanyPage()
  const company = ctx.company
  const [members, shareholders] = await Promise.all([
    listMembers(company.id),
    listShareholders(company.id),
  ])

  const totalRatio = shareholders.reduce((sum, s) => sum + (s.ratio ?? 0), 0)

  return (
    <>
      <PageHeader
        title="会社情報"
        description="登記・口座開設・補助金申請で何度も書く情報です。ここを最新にしておくと転記が楽になります。"
        action={
          canManageCompany(ctx.role) ? (
            <RecordDialog
              label="編集"
              title="会社情報を編集"
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
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="段階" value={STAGE_LABEL[company.stage]} />
        <StatCard label="役員" value={members.filter((m) => m.isOfficer).length} unit="名" href="/company-os/company/officers" />
        <StatCard label="メンバー" value={members.length} unit="名" href="/company-os/company/members" />
        <StatCard
          label="株主"
          value={shareholders.length}
          unit="名"
          hint={shareholders.length > 0 ? `出資比率の合計 ${totalRatio}%` : undefined}
          tone={shareholders.length > 0 && Math.abs(totalRatio - 100) > 0.01 ? 'warn' : 'neutral'}
          href="/company-os/company/shareholders"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="基本情報">
          <dl>
            <DefRow label="会社名">{company.name}</DefRow>
            <DefRow label="登記上の商号">{company.legalName ?? '未設定'}</DefRow>
            <DefRow label="業種">{company.industry ?? '未設定'}</DefRow>
            <DefRow label="設立日">{company.foundedOn ? formatShortDate(company.foundedOn) : '未設定'}</DefRow>
            <DefRow label="資本金">
              {company.capital === null ? '未設定' : `${company.capital.toLocaleString('ja-JP')}円`}
            </DefRow>
            <DefRow label="決算月">{company.fiscalMonth ? `${company.fiscalMonth}月` : '未設定'}</DefRow>
            <DefRow label="法人番号">{company.corporateNumber ?? '未設定'}</DefRow>
          </dl>
        </SectionCard>

        <SectionCard title="連絡先">
          <dl>
            <DefRow label="本店所在地">{company.address ?? '未設定'}</DefRow>
            <DefRow label="電話番号">{company.phone ?? '未設定'}</DefRow>
            <DefRow label="ウェブサイト">
              {company.website ? (
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-slate-700 underline">
                  {company.website}
                </a>
              ) : (
                '未設定'
              )}
            </DefRow>
            <DefRow label="何のための会社か">{company.vision ?? '未設定'}</DefRow>
          </dl>
        </SectionCard>
      </div>

      {company.notes ? (
        <SectionCard className="mt-4" title="メモ">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{company.notes}</p>
        </SectionCard>
      ) : null}

      <Card className="mt-4 p-4">
        <p className="text-xs leading-relaxed text-slate-500">
          事業目的は
          <Link href="/company-os/company/purpose" className="mx-1 underline underline-offset-2">
            会社目的
          </Link>
          の画面で編集できます。会社を追加するときは
          <Link href="/company-os/setup" className="mx-1 underline underline-offset-2">
            会社を追加
          </Link>
          から。
        </p>
      </Card>
    </>
  )
}
