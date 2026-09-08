'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { api } from './api'

/**
 * KPI の現在値をその場で更新する。
 *
 * 経営数値は毎週書き換わる。ダイアログを開かせると更新が続かないので、
 * 数字を打って離れるだけで保存されるようにしている。
 */
export function MetricInput({
  objectiveId,
  field,
  value,
  unit,
  ariaLabel,
}: {
  objectiveId: string
  field: 'currentValue' | 'targetValue'
  value: number | null
  unit: string | null
  ariaLabel: string
}) {
  const router = useRouter()
  const [text, setText] = useState(value === null ? '' : String(value))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commit() {
    const trimmed = text.trim()
    const next = trimmed === '' ? null : Number(trimmed.replace(/,/g, ''))
    if (next !== null && !Number.isFinite(next)) {
      setError('数字で入力してください')
      return
    }
    if (next === value) return

    setSaving(true)
    setError(null)
    const result = await api.update('objectives', objectiveId, { [field]: next })
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? '保存に失敗しました')
      return
    }
    router.refresh()
  }

  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-center gap-1">
        <input
          aria-label={ariaLabel}
          value={text}
          inputMode="numeric"
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none disabled:opacity-60"
        />
        {unit ? <span className="text-xs text-slate-500">{unit}</span> : null}
      </span>
      {error ? <span className="mt-0.5 text-[11px] text-red-600">{error}</span> : null}
    </span>
  )
}
