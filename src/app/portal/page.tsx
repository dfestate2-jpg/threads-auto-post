import Link from 'next/link'
import type { Metadata } from 'next'

import { PORTAL_SUBTITLE, PORTAL_TITLE, PortalShell } from '@/components/portal/PortalShell'
import { SystemGrid } from '@/components/portal/SystemGrid'
import { hasRole, requirePageSession } from '@/lib/auth/guard'
import type { PortalRole } from '@/lib/domain/portal'
import { prisma } from '@/lib/prisma'
import { listVisibleSystems } from '@/lib/services/portal'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${PORTAL_TITLE}｜${PORTAL_SUBTITLE}`,
  robots: { index: false, follow: false },
}

const ROLE_NAME: Record<PortalRole, string> = { STAFF: '担当者', MANAGER: '責任者', ADMIN: '管理者' }

export default async function PortalHomePage() {
  const session = await requirePageSession()
  const isAdmin = hasRole(session, 'ADMIN')

  const [user, systems] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } }),
    listVisibleSystems(session.role),
  ])

  return (
    <PortalShell
      user={{ name: user?.name ?? 'ユーザー', roleLabel: ROLE_NAME[session.role] }}
      isAdmin={isAdmin}
    >
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">システム一覧</h1>
        <p className="mt-1 text-sm text-slate-500">使いたいシステムを選んでください。</p>
      </div>

      {systems.length > 0 ? (
        <SystemGrid systems={systems} />
      ) : (
        <EmptyState isAdmin={isAdmin} />
      )}
    </PortalShell>
  )
}

/**
 * 1件も無いときに真っ白な画面を見せない。
 * 管理者には次にやることを、それ以外の人には「壊れていない」ことを伝える。
 */
function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <p className="text-4xl" aria-hidden>
        🗂️
      </p>
      <p className="mt-3 text-sm font-medium text-slate-700">まだシステムが登録されていません</p>
      {isAdmin ? (
        <>
          <p className="mt-1 text-sm text-slate-500">設定画面から、社内で使うシステムを登録してください。</p>
          <Link href="/portal/admin" className="btn-primary mt-5">
            設定画面を開く
          </Link>
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-500">管理者が登録すると、ここに表示されます。</p>
      )}
    </div>
  )
}
