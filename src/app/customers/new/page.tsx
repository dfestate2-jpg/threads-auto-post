import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { NewCustomerForm } from '@/components/followup/NewCustomerForm'
import { requirePageSession } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function NewCustomerPage() {
  const session = await requirePageSession()
  const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } })

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">顧客登録</h1>
        <Link href="/customers" className="text-sm text-slate-600 hover:underline">
          ← 顧客一覧へ
        </Link>
      </div>
      <NewCustomerForm
        staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        defaultAssigneeId={session.staffId}
      />
    </AppShell>
  )
}
