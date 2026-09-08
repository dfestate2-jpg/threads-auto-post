'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { api } from './api'

export interface MilestoneRow {
  id: string
  name: string
  dueLabel: string
  done: boolean
}

/** マイルストーンの達成チェック。節目は数が少ないので、その場で切り替えられれば十分 */
export function MilestoneList({ milestones }: { milestones: MilestoneRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  if (milestones.length === 0) {
    return <p className="text-sm text-slate-400">まだ設定されていません。</p>
  }

  async function toggle(id: string, done: boolean) {
    setBusy(id)
    const result = await api.update('milestones', id, { done })
    setBusy(null)
    if (result.ok) router.refresh()
  }

  async function remove(id: string) {
    if (!window.confirm('このマイルストーンを削除します。よろしいですか？')) return
    setBusy(id)
    const result = await api.remove('milestones', id)
    setBusy(null)
    if (result.ok) router.refresh()
  }

  return (
    <ul className="space-y-2">
      {milestones.map((m) => (
        <li key={m.id} className="group flex items-start gap-2">
          <input
            type="checkbox"
            checked={m.done}
            disabled={busy === m.id}
            onChange={(e) => void toggle(m.id, e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
            aria-label={`${m.name}を達成にする`}
          />
          <div className="min-w-0 flex-1">
            <p className={`text-sm ${m.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{m.name}</p>
            <p className="text-xs text-slate-400">{m.dueLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => void remove(m.id)}
            className="text-xs text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
            aria-label={`${m.name}を削除`}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}
