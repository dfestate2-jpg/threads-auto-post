'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ActionBadge, CustomerStatusBadge, PriorityBadge } from '@/components/ui'
import { ACTION_TYPE_LABEL } from '@/lib/domain/followUp'
import type { ActionType, CustomerStatus, FollowUpPriority } from '@prisma/client'

export interface TodayItem {
  id: string
  name: string
  status: CustomerStatus
  priority: FollowUpPriority
  nextActionType: ActionType | null
  nextActionNote: string | null
  dueLabel: string
  reason: string
  overdueDays: number
  assigneeName: string | null
  phone: string | null
  hasLine: boolean
}

/**
 * 今日やることの1区画。
 *
 * 1件あたりの操作を1〜2クリックに抑えるため、
 * 「次にやるべきこと」のボタンだけを大きく出し、他の操作は詳細画面に置く。【指示書 3・7】
 */
export function TodaySection({
  title,
  items,
  tone,
  emptyText,
  hint,
}: {
  title: string
  items: TodayItem[]
  tone: 'danger' | 'warn' | 'normal'
  emptyText: string
  hint?: string
}) {
  const border =
    tone === 'danger' ? 'border-red-300' : tone === 'warn' ? 'border-orange-300' : 'border-slate-200'
  const head =
    tone === 'danger'
      ? 'bg-red-50 text-red-900'
      : tone === 'warn'
        ? 'bg-orange-50 text-orange-900'
        : 'bg-slate-50 text-slate-800'

  return (
    <section className={`card overflow-hidden border ${border}`}>
      <div className={`flex items-center justify-between px-4 py-2 ${head}`}>
        <h2 className="text-sm font-bold">
          {title} <span className="ml-1 tabular-nums">{items.length}件</span>
        </h2>
        {hint ? <span className="text-xs">{hint}</span> : null}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <TodayRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TodayRow({ item }: { item: TodayItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  /** 「やった」を1クリックで記録する。日付もステータスもシステム側で更新される */
  async function complete(actionType: ActionType, result: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/customers/${item.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, result }),
      })
      if (res.ok) {
        setDone(true)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const action = item.nextActionType ?? 'OTHER'
  const isLine = action === 'LINE'

  return (
    <li className={`flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4 ${done ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2 md:w-64">
        <PriorityBadge priority={item.priority} />
        <Link href={`/customers/${item.id}`} className="font-bold text-slate-900 hover:underline">
          {item.name}
        </Link>
        {item.overdueDays > 0 ? (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
            {item.overdueDays}日超過
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-2 text-sm">
        <CustomerStatusBadge status={item.status} />
        <span className="text-slate-600">{item.reason}</span>
        <span className="text-slate-400">→</span>
        <ActionBadge type={item.nextActionType} />
        <span className="text-slate-700">{item.nextActionNote}</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 md:w-40">
        <span>期限 {item.dueLabel}</span>
        {item.assigneeName ? <span className="truncate">/ {item.assigneeName}</span> : null}
      </div>

      <div className="flex shrink-0 gap-2">
        {isLine ? (
          <Link href={`/customers/${item.id}?compose=1`} className="btn-primary px-3 py-1.5 text-xs">
            LINEを送る
          </Link>
        ) : null}
        {item.phone && action === 'CALL' ? (
          <a href={`tel:${item.phone}`} className="btn-primary px-3 py-1.5 text-xs">
            電話をかける
          </a>
        ) : null}
        <button
          className="btn-secondary px-3 py-1.5 text-xs"
          disabled={busy || done}
          onClick={() => complete(action as ActionType, `${ACTION_TYPE_LABEL[action as ActionType]}で対応`)}
        >
          {done ? '記録しました' : '対応した'}
        </button>
      </div>
    </li>
  )
}
