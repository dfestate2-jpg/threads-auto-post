'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { ThemeToggle } from '@/components/ThemeToggle'
import { NAV_GROUPS, NAV_ROOT, isActive } from '@/lib/company-os/nav'
import { api } from './api'

export interface ShellUser {
  name: string
  roleLabel: string
}

export interface ShellCompany {
  id: string
  name: string
  stageLabel: string
}

/**
 * Company OS の外枠。
 *
 * 左に領域別のメニュー、上に会社の切り替えと横断検索。
 * パソコンで常時開いて使う前提なのでメニューは常に見えている状態を既定にし、
 * 狭い画面ではボタンで開閉する。
 */
export function CompanyOsShell({
  user,
  companies,
  currentCompanyId,
  children,
}: {
  user: ShellUser
  companies: ShellCompany[]
  currentCompanyId: string | null
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-5">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg px-2 py-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
          >
            ☰
          </button>

          <Link href={NAV_ROOT} className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              OS
            </span>
            <span className="hidden min-w-0 leading-tight sm:block">
              <span className="block truncate text-sm font-bold text-slate-900">Company OS</span>
              <span className="block text-[11px] text-slate-500">会社経営を一元管理する</span>
            </span>
          </Link>

          <CompanySwitcher companies={companies} currentCompanyId={currentCompanyId} />

          <SearchBox />

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden text-right leading-tight md:block">
              <span className="block text-xs font-medium text-slate-800">{user.name}</span>
              <span className="block text-[11px] text-slate-500">{user.roleLabel}</span>
            </span>
            <ThemeToggle />
            <Link
              href="/portal"
              className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              他のシステム
            </Link>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 狭い画面では覆いかぶさる。広い画面では常に見えている */}
        {menuOpen ? (
          <div className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />
        ) : null}
        <nav
          className={`fixed inset-y-0 left-0 z-20 w-64 overflow-y-auto border-r border-slate-200 bg-white pt-16 transition-transform lg:sticky lg:top-[57px] lg:z-0 lg:h-[calc(100vh-57px)] lg:translate-x-0 lg:pt-0 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-label="メインメニュー"
        >
          <div className="p-3">
            <Link
              href={NAV_ROOT}
              onClick={() => setMenuOpen(false)}
              className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                pathname === NAV_ROOT ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span aria-hidden>📊</span> ダッシュボード
            </Link>

            {NAV_GROUPS.map((group) => (
              <NavGroupBlock
                key={group.label}
                group={group}
                pathname={pathname}
                search={search}
                onNavigate={() => setMenuOpen(false)}
              />
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  )
}

function NavGroupBlock({
  group,
  pathname,
  search,
  onNavigate,
}: {
  group: (typeof NAV_GROUPS)[number]
  pathname: string
  search: string
  onNavigate: () => void
}) {
  const containsActive = group.items.some((item) => isActive(item.href, pathname, search ? `?${search}` : ''))
  const [open, setOpen] = useState(containsActive)

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-500 hover:bg-slate-100"
        aria-expanded={open}
      >
        <span aria-hidden>{group.icon}</span>
        <span className="flex-1">{group.label}</span>
        <span className="text-[10px] text-slate-400" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <ul className="mb-1 space-y-0.5 pl-4">
          {group.items.map((item) => {
            const active = isActive(item.href, pathname, search ? `?${search}` : '')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-[13px] ${
                    active ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {!item.ready ? (
                    <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                      Phase{item.phase}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function CompanySwitcher({
  companies,
  currentCompanyId,
}: {
  companies: ShellCompany[]
  currentCompanyId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (companies.length === 0) return null

  async function change(id: string) {
    setBusy(true)
    const result = await api.post('/companies/switch', { companyId: id })
    setBusy(false)
    if (result.ok) {
      router.push(NAV_ROOT)
      router.refresh()
    }
  }

  if (companies.length === 1) {
    const only = companies[0]
    return (
      <span className="min-w-0 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700">
        {only?.name}
      </span>
    )
  }

  return (
    <select
      aria-label="会社を切り替える"
      value={currentCompanyId ?? ''}
      disabled={busy}
      onChange={(e) => void change(e.target.value)}
      className="max-w-[10rem] truncate rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-slate-500 focus:outline-none disabled:opacity-60"
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}（{c.stageLabel}）
        </option>
      ))}
    </select>
  )
}

/** 横断検索。会社の情報がどこにあっても、ここから辿り着けるようにする */
function SearchBox() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const q = query.trim()
        if (q.length === 0) return
        router.push(`${NAV_ROOT}/search?q=${encodeURIComponent(q)}`)
      }}
      className="hidden min-w-0 flex-1 sm:block"
      role="search"
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="タスク・課題・決定事項・会議を検索"
        aria-label="社内を横断して検索"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
      />
    </form>
  )
}
