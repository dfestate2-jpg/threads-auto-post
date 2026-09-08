import Link from 'next/link'

import { CompanySetupForm } from '@/components/company-os/CompanySetupForm'
import { Card, PageHeader } from '@/components/company-os/ui'
import { pageContext } from '@/lib/services/companyOs/context'

export const dynamic = 'force-dynamic'

/** 最初の1回だけ通る画面。会社が無いと、他のどの画面も意味を持たない */
export default async function CompanyOsSetupPage() {
  const ctx = await pageContext()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={ctx.company ? '会社を追加する' : 'Company OS をはじめる'}
        description={
          ctx.company
            ? '買収した会社や、新しく立ち上げる別会社を追加できます。上部の切り替えで行き来します。'
            : 'まず会社を1つ登録します。あとから何度でも直せるので、決まっていない項目は空のままで構いません。'
        }
      />

      <Card className="p-5">
        <CompanySetupForm />
      </Card>

      {ctx.company ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          <Link href="/company-os" className="underline underline-offset-2 hover:text-slate-800">
            ダッシュボードへ戻る
          </Link>
        </p>
      ) : null}
    </div>
  )
}
