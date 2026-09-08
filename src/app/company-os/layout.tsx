import type { Metadata } from 'next'

import { CompanyOsShell } from '@/components/company-os/Shell'
import { ROLE_LABEL, STAGE_LABEL } from '@/lib/company-os/labels'
import { pageContext } from '@/lib/services/companyOs/context'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Company OS｜会社経営を一元管理する',
  description: '会社の立ち上げから経営までを一つの場所で管理する',
  robots: { index: false, follow: false },
}

export default async function CompanyOsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext()

  return (
    <CompanyOsShell
      user={{ name: ctx.userName, roleLabel: ROLE_LABEL[ctx.role] }}
      companies={ctx.companies.map((c) => ({ id: c.id, name: c.name, stageLabel: STAGE_LABEL[c.stage] }))}
      currentCompanyId={ctx.company?.id ?? null}
    >
      {children}
    </CompanyOsShell>
  )
}
