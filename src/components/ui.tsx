import { HandlingStatus, type ActionType, type CustomerStatus, type FollowUpPriority } from '@prisma/client'
import Link from 'next/link'

import { ACTION_TYPE_LABEL, CUSTOMER_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/domain/followUp'
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

// ---------------------------------------------------------------------------
// 追客管理
// ---------------------------------------------------------------------------

/** ステータスごとの色。進んでいるほど濃く、止まっているものは警戒色にする */
const CUSTOMER_STATUS_CLASS: Record<CustomerStatus, string> = {
  NEW_INQUIRY: 'bg-red-100 text-red-800 border-red-200',
  FIRST_CONTACTED: 'bg-orange-100 text-orange-800 border-orange-200',
  HEARING_DONE: 'bg-amber-100 text-amber-800 border-amber-200',
  PROPOSING: 'bg-sky-100 text-sky-800 border-sky-200',
  AWAITING_QUOTE: 'bg-violet-100 text-violet-800 border-violet-200',
  VIEWING_ARRANGING: 'bg-blue-100 text-blue-800 border-blue-200',
  VIEWED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  APPLICATION_REVIEW: 'bg-teal-100 text-teal-800 border-teal-200',
  APPLIED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CONTRACTED: 'bg-green-600 text-white border-green-700',
  ON_HOLD: 'bg-slate-100 text-slate-700 border-slate-200',
  NO_REPLY: 'bg-rose-100 text-rose-800 border-rose-200',
  LOST: 'bg-slate-200 text-slate-600 border-slate-300',
  DORMANT: 'bg-slate-100 text-slate-500 border-slate-200',
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${CUSTOMER_STATUS_CLASS[status]}`}>
      {CUSTOMER_STATUS_LABEL[status]}
    </span>
  )
}

const PRIORITY_CLASS: Record<FollowUpPriority, string> = {
  S: 'bg-red-600 text-white',
  A: 'bg-orange-500 text-white',
  B: 'bg-slate-200 text-slate-700',
  C: 'bg-green-100 text-green-700',
}

export function PriorityBadge({ priority }: { priority: FollowUpPriority }) {
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded font-bold ${PRIORITY_CLASS[priority]}`}
      title={PRIORITY_LABEL[priority]}
    >
      {priority}
    </span>
  )
}

/** 次回アクションの種類。営業マンが一目で「何をするか」を判断できるようにする */
const ACTION_ICON: Record<ActionType, string> = {
  LINE: '💬',
  CALL: '📞',
  PROPOSE: '🏠',
  VIEWING: '🚗',
  QUOTE: '🧾',
  MEETING: '🤝',
  SYSTEM: '⚙️',
  OTHER: '📝',
}

export function ActionBadge({ type }: { type: ActionType | null }) {
  if (!type) return <span className="text-slate-400">—</span>
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
      <span aria-hidden>{ACTION_ICON[type]}</span>
      {ACTION_TYPE_LABEL[type]}
    </span>
  )
}

export function formatDateJa(date: Date | null | undefined, timezone: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ja-JP', { timeZone: timezone, month: 'numeric', day: 'numeric' }).format(date)
}

export function formatYen(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toLocaleString('ja-JP')}円`
}
