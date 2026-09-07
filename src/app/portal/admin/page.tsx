import Link from 'next/link'
import type { Metadata } from 'next'

import { PORTAL_TITLE, PortalShell } from '@/components/portal/PortalShell'
import { SystemAdminTable, type SystemRow } from '@/components/portal/SystemAdminTable'
import { hasRole, requirePageSession } from '@/lib/auth/guard'
import type { PortalRole } from '@/lib/domain/portal'
import { prisma } from '@/lib/prisma'
import { listAllSystems } from '@/lib/services/portal'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `システム管理｜${PORTAL_TITLE}`,
  robots: { index: false, follow: false },
}

const ROLE_NAME: Record<PortalRole, string> = { STAFF: '担当者', MANAGER: '責任者', ADMIN: '管理者' }

export default async function PortalAdminPage() {
  const session = await requirePageSession()
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } })
  const shellUser = { name: user?.name ?? 'ユーザー', roleLabel: ROLE_NAME[session.role] }

  // 権限不足はログイン画面へ飛ばさず、理由を見せて戻れるようにする
  if (!hasRole(session, 'ADMIN')) {
    return (
      <PortalShell user={shellUser} isAdmin={false} current="admin">
        <div className="card px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">この画面は管理者だけが開けます</p>
          <Link href="/portal" className="btn-secondary mt-5">
            システム一覧へ戻る
          </Link>
        </div>
      </PortalShell>
    )
  }

  const systems = await listAllSystems()
  const rows: SystemRow[] = systems.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    accent: s.accent,
    description: s.description,
    url: s.url,
    openInNewTab: s.openInNewTab,
    published: s.published,
    minRole: s.minRole as PortalRole,
  }))

  return (
    <PortalShell user={shellUser} isAdmin current="admin">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">システム管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          トップページに並ぶシステムを追加・編集・削除できます。コードの修正は必要ありません。
        </p>
      </div>

      <SystemAdminTable initial={rows} />
    </PortalShell>
  )
}
