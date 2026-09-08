/**
 * Company OS の表示部品。
 *
 * 経営者が毎日開く画面なので、情報量は多いが詰まって見えないことを優先する。
 * ここにある部品だけで画面を組み立て、余白・角丸・文字サイズを全画面でそろえる。
 */
import Link from 'next/link'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
}

/** 見出し付きの区画。右上に操作ボタンを置けるようにしてある */
export function SectionCard({
  title,
  hint,
  action,
  children,
  className = '',
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  )
}

const TONES = {
  neutral: 'border-slate-200',
  info: 'border-blue-200 bg-blue-50/60',
  warn: 'border-orange-200 bg-orange-50/60',
  danger: 'border-red-200 bg-red-50/60',
  ok: 'border-emerald-200 bg-emerald-50/60',
} as const

export type Tone = keyof typeof TONES

export function StatCard({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  hint?: string
  tone?: Tone
  href?: string
}) {
  const body = (
    <>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-slate-900">{value}</span>
        {unit ? <span className="text-xs text-slate-500">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</div> : null}
    </>
  )
  const className = `block rounded-xl border p-4 shadow-sm transition ${TONES[tone]} bg-white`
  if (href) {
    return (
      <Link href={href} className={`${className} hover:border-slate-400 hover:shadow`}>
        {body}
      </Link>
    )
  }
  return <div className={className}>{body}</div>
}

export function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  )
}

/** 進捗バー。数字だけだと「あとどれくらいか」が伝わらない */
export function ProgressBar({ percent, tone = 'ok' }: { percent: number; tone?: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const colors = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-red-500',
    neutral: 'bg-slate-400',
  } as const
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`進捗 ${percent}%`}>
      <div className={`h-full rounded-full transition-all ${colors[tone]}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

/**
 * データが1件も無いときの表示。
 * 「壊れているのか、まだ入れていないだけなのか」を必ず区別できるようにする。
 */
export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-3xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-[0.01em] text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** 横に長い表を、狭い画面でも崩さずに見せる */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="min-w-full align-middle">{children}</div>
    </div>
  )
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500 ${className}`}>
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-middle text-sm text-slate-700 ${className}`}>{children}</td>
}

/** 定義リスト。会社情報のような「項目名＋値」の並びに使う */
export function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-b-0 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-medium text-slate-500 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-slate-800">{children}</dd>
    </div>
  )
}
