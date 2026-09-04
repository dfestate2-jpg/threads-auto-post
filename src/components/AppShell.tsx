import Link from 'next/link'

import { LogoutButton } from './LogoutButton'

const NAV = [
  { href: '/', label: '今日やること' },
  { href: '/customers', label: '顧客' },
  { href: '/reminders', label: '未返信' },
  { href: '/admin', label: '管理者' },
  { href: '/settings', label: '設定' },
  // 他の業務システムへ戻れる入口。ここから行き来できないと、
  // ポータルを開き直すためにURLを打ち直すことになる
  { href: '/portal', label: '他のシステム' },
]

/**
 * 営業担当も管理者もスマホとパソコンの両方から見る。
 * ナビゲーションは指で押す前提のサイズ（高さ44px相当）にし、
 * 狭い画面ではタイトルの下に折り返して詰まらないようにする。
 */
export function AppShell({ children, alert }: { children: React.ReactNode; alert?: string | null }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between gap-3 pt-3 sm:pt-4">
            <Link href="/" className="text-base font-bold sm:text-lg">
              追客管理
            </Link>
            <LogoutButton />
          </div>
          <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 pt-2 sm:pt-3">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded-lg px-4 py-2.5 text-[15px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {alert ? (
        <div className="border-b border-red-300 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-800">
          {alert}
        </div>
      ) : null}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:py-6">{children}</main>
    </div>
  )
}
