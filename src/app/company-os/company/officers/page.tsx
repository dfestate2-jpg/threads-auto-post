import Link from 'next/link'

import { RecordDialog } from '@/components/company-os/RecordDialog'
import { Card, EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { canManageCompany } from '@/lib/company-os/access'
import { memberFields } from '@/lib/company-os/formSpecs'
import { ROLE_LABEL } from '@/lib/company-os/labels'
import { listMembers } from '@/lib/services/companyOs/company'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/** 役員。登記事項なので、組織一覧とは別に取り出して見せる */
export default async function OfficersPage() {
  const ctx = await requireCompanyPage()
  const members = await listMembers(ctx.company.id, { includeInactive: true })
  const officers = members.filter((m) => m.isOfficer)
  const canManage = canManageCompany(ctx.role)

  const addButton = canManage ? (
    <RecordDialog
      label="＋ 役員を追加"
      title="役員を追加"
      resource="members"
      fields={memberFields()}
      record={{ role: 'MANAGER', active: true, isOfficer: true, title: '取締役' }}
    />
  ) : null

  return (
    <>
      <PageHeader
        title="役員"
        description="登記されている役員です。組織のメンバー登録で「役員として登録する」を付けると、ここに並びます。"
        action={addButton}
      />

      {officers.length === 0 ? (
        <EmptyState
          icon="🎩"
          title="役員が登録されていません"
          description="代表者と取締役を登録すると、定款・登記の準備で参照できます。"
          action={addButton}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {officers.map((officer) => (
            <Card key={officer.id} className="p-4">
              <p className="text-xs text-slate-500">{officer.title ?? '役員'}</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{officer.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                権限 {ROLE_LABEL[officer.role]}
                {officer.active ? '' : '・退任'}
              </p>
              {officer.note ? <p className="mt-2 text-xs leading-relaxed text-slate-500">{officer.note}</p> : null}
            </Card>
          ))}
        </div>
      )}

      <SectionCard className="mt-4" title="関連する画面">
        <p className="text-sm text-slate-600">
          <Link href="/company-os/company/members" className="underline underline-offset-2">
            組織
          </Link>
          で全メンバーを、
          <Link href="/company-os/company/shareholders" className="mx-1 underline underline-offset-2">
            株主
          </Link>
          で出資比率を管理します。
        </p>
      </SectionCard>
    </>
  )
}
