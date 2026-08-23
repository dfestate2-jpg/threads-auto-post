import Link from 'next/link'

import { LogoutButton } from './LogoutButton'

const NAV = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/customers', label: '未返信一覧' },
  { href: '/settings', label: '設定' },
]

export function AppShell({ children, alert }: { children: React.ReactNode; alert?: string | null }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold">公式LINE 未返信リマインド</span>
            <nav className="flex gap-4">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-sm text-slate-600 hover:text-slate-900">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      {alert ? (
        <div className="border-b border-red-300 bg-red-50 px-4 py-2 text-center text-sm font-medium text-red-800">
          {alert}
        </div>
      ) : null}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
