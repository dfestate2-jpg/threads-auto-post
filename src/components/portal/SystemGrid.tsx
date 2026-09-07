import Link from 'next/link'
import type { PortalSystem } from '@prisma/client'

import { accentOf, isInternalUrl } from '@/lib/domain/portal'

/**
 * システム一覧。スマホのホーム画面のように「アプリを選ぶ」感覚で押せる形にする。
 *
 * 遷移先はサーバー側で DB の値から描くので、管理画面でURLを変えれば
 * 次に開いた時点で新しいURLに切り替わる。コードにURLは持たない。
 */
export function SystemGrid({ systems }: { systems: PortalSystem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {systems.map((s) => (
        <li key={s.id}>
          <SystemCard system={s} />
        </li>
      ))}
    </ul>
  )
}

function SystemCard({ system }: { system: PortalSystem }) {
  const accent = accentOf(system.accent)
  const className = [
    'group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition',
    'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm sm:p-5',
    accent.ring,
  ].join(' ')

  const body = (
    <>
      {/*
        別タブで開く印。ドメイン名を1行使って出すよりも、
        角の小さな記号のほうがカードの字組みを乱さない。
      */}
      {system.openInNewTab ? (
        <span className="absolute right-3 top-3 text-xs text-slate-300 transition group-hover:text-slate-400" aria-hidden>
          ↗
        </span>
      ) : null}

      <span
        className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition group-hover:scale-105 sm:h-14 sm:w-14 sm:text-[28px] ${accent.tile}`}
        aria-hidden
      >
        {system.icon}
      </span>

      <span className="block break-words text-[15px] font-bold leading-snug tracking-[0.01em] text-slate-900 sm:text-base">
        {system.name}
      </span>
      {system.description ? (
        <span className="mt-1.5 block break-words text-xs leading-relaxed text-slate-500 sm:text-[13px]">
          {system.description}
        </span>
      ) : null}
      {system.openInNewTab ? <span className="sr-only">（別のタブで開きます）</span> : null}
    </>
  )

  // 同一サイト内は Link（先読みが効く）、外部システムは通常のリンク
  if (isInternalUrl(system.url) && !system.openInNewTab) {
    return (
      <Link href={system.url} className={className}>
        {body}
      </Link>
    )
  }
  return (
    <a
      href={system.url}
      className={className}
      {...(system.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {body}
    </a>
  )
}
