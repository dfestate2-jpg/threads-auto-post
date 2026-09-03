import { HandlingStatus } from '@prisma/client'
import Link from 'next/link'

import { formatElapsedJa } from '@/lib/domain/time'

export const STATUS_LABEL: Record<HandlingStatus, string> = {
  UNHANDLED: '未対応',
  IN_PROGRESS: '対応中',
  DONE: '対応済み',
  NEEDS_CHECK: '要確認',
}

const STATUS_CLASS: Record<HandlingStatus, string> = {
  UNHANDLED: 'bg-red-100 text-red-800 border-red-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 border-amber-200',
  DONE: 'bg-green-100 text-green-800 border-green-200',
  NEEDS_CHECK: 'bg-purple-100 text-purple-800 border-purple-200',
}

export function StatusBadge({ status }: { status: HandlingStatus }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

/** 未返信経過時間。長時間ほど強い色にして見落としを防ぐ */
export function ElapsedBadge({ minutes, size = 'md' }: { minutes: number | null; size?: 'md' | 'lg' }) {
  if (minutes === null) return <span className="text-slate-400">—</span>
  const cls =
    minutes >= 1440
      ? 'bg-red-600 text-white'
      : minutes >= 180
        ? 'bg-red-100 text-red-800'
        : minutes >= 60
          ? 'bg-orange-100 text-orange-800'
          : 'bg-slate-100 text-slate-700'
  // 一覧で最初に目に入るべき情報なので、狭い画面では大きめに出す
  const sizeCls = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-block whitespace-nowrap rounded font-semibold tabular-nums ${sizeCls} ${cls}`}>
      {formatElapsedJa(minutes)}
    </span>
  )
}

export function StatCard({
  label,
  value,
  tone = 'neutral',
  hint,
  href,
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'warn' | 'danger' | 'ok'
  hint?: string
  /** 指定するとカード全体が該当一覧へのリンクになる */
  href?: string
}) {
  const tones = {
    neutral: 'border-slate-200',
    warn: 'border-orange-300 bg-orange-50',
    danger: 'border-red-300 bg-red-50',
    ok: 'border-green-300 bg-green-50',
  } as const
  const body = (
    <>
      <div className="text-xs font-medium text-slate-600 sm:text-sm">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </>
  )
  /**
   * 数字を見て「で、どれ？」となるのを避けるため、
   * 該当する一覧へそのまま飛べるようにする。カード全体が対象なので指でも押しやすい。
   */
  if (href) {
    return (
      <Link href={href} className={`card block border p-4 transition hover:border-slate-400 active:bg-slate-50 ${tones[tone]}`}>
        {body}
        <span className="mt-2 block text-xs font-medium text-slate-500">一覧を見る →</span>
      </Link>
    )
  }
  return <div className={`card border p-4 ${tones[tone]}`}>{body}</div>
}

export function formatDateTimeJa(date: Date | null | undefined, timezone: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
