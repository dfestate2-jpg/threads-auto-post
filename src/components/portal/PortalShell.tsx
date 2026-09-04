import Link from 'next/link'

import { LogoutButton } from '@/components/LogoutButton'

export const PORTAL_TITLE = 'DFエステートシステム'
export const PORTAL_SUBTITLE = '業務システムポータル'

/**
 * ポータル共通の外枠。
 *
 * 「会社の入口」なので、開いた瞬間に何のページか分かることを最優先にしている。
 * ヘッダーは左にサービス名、右に設定・ユーザー・ログアウト。
 * 狭い画面では右側が詰まるため、ユーザー名は隠してアイコン相当の情報だけ残す。
 */
export function PortalShell({
  children,
  user,
  isAdmin,
  current = 'home',
}: {
  children: React.ReactNode
  user: { name: string; roleLabel: string }
  isAdmin: boolean
  current?: 'home' | 'admin'
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/portal" className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
              DF
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold text-slate-900 sm:text-base">{PORTAL_TITLE}</span>
              <span className="hidden text-xs text-slate-500 sm:block">{PORTAL_SUBTITLE}</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            {isAdmin ? (
              <Link
                href={current === 'admin' ? '/portal' : '/portal/admin'}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {current === 'admin' ? 'トップへ' : '設定'}
              </Link>
            ) : null}
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-medium text-slate-800">{user.name}</span>
              <span className="block text-xs text-slate-500">{user.roleLabel}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 text-center text-xs text-slate-400 sm:px-6">
        {PORTAL_TITLE}
      </footer>
    </div>
  )
}
