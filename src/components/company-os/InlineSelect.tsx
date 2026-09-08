'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { api } from './api'

/**
 * 一覧の中でそのまま状態を変えるための選択欄。
 *
 * ステータス変更のたびに詳細画面を開かせると、
 * 「今日の棚卸し」が現実的な時間で終わらない。
 */
export function InlineSelect({
  resource,
  id,
  name,
  value,
  options,
  className = '',
  ariaLabel,
}: {
  resource: string
  id: string
  name: string
  value: string
  options: { value: string; label: string }[]
  className?: string
  ariaLabel: string
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: string) {
    const previous = current
    setCurrent(next)
    setBusy(true)
    setError(null)
    const result = await api.update(resource, id, { [name]: next })
    setBusy(false)
    if (!result.ok) {
      // 失敗したら見た目を元に戻す。成功したように見せない
      setCurrent(previous)
      setError(result.error ?? '更新に失敗しました')
      return
    }
    router.refresh()
  }

  return (
    <span className="inline-flex flex-col">
      <select
        aria-label={ariaLabel}
        value={current}
        disabled={busy}
        onChange={(e) => void change(e.target.value)}
        className={`rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-slate-500 focus:outline-none disabled:opacity-60 ${className}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-0.5 text-[11px] text-red-600">{error}</span> : null}
    </span>
  )
}

/** チェックボックス1つで完了に変える。タスク一覧の左端に置く */
export function ToggleDone({
  resource,
  id,
  status,
  ariaLabel,
}: {
  resource: string
  id: string
  status: string
  ariaLabel: string
}) {
  const router = useRouter()
  const [done, setDone] = useState(status === 'DONE')
  const [busy, setBusy] = useState(false)

  async function toggle() {
    const next = !done
    setDone(next)
    setBusy(true)
    const result = await api.update(resource, id, { status: next ? 'DONE' : 'TODO' })
    setBusy(false)
    if (!result.ok) {
      setDone(!next)
      return
    }
    router.refresh()
  }

  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={done}
      disabled={busy}
      onChange={() => void toggle()}
      className="h-4 w-4 shrink-0 rounded border-slate-300 disabled:opacity-50"
    />
  )
}
