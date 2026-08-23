import { HandlingStatus } from '@prisma/client'

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
export function ElapsedBadge({ minutes }: { minutes: number | null }) {
  if (minutes === null) return <span className="text-slate-400">—</span>
  const cls =
    minutes >= 1440
      ? 'bg-red-600 text-white'
      : minutes >= 180
        ? 'bg-red-100 text-red-800'
        : minutes >= 60
          ? 'bg-orange-100 text-orange-800'
          : 'bg-slate-100 text-slate-700'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>{formatElapsedJa(minutes)}</span>
}

export function StatCard({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'warn' | 'danger' | 'ok'
  hint?: string
}) {
  const tones = {
    neutral: 'border-slate-200',
    warn: 'border-orange-300 bg-orange-50',
    danger: 'border-red-300 bg-red-50',
    ok: 'border-green-300 bg-green-50',
  } as const
  return (
    <div className={`card border p-4 ${tones[tone]}`}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
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
