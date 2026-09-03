'use client'

import { HandlingStatus } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const OPTIONS: { value: HandlingStatus; label: string }[] = [
  { value: 'UNHANDLED', label: '未対応' },
  { value: 'IN_PROGRESS', label: '対応中' },
  { value: 'DONE', label: '対応済み' },
  { value: 'NEEDS_CHECK', label: '要確認' },
]

/** 一覧でも状況が一目で分かるよう、詳細画面のバッジと同じ配色にする */
const TONE: Record<HandlingStatus, string> = {
  UNHANDLED: 'border-red-200 bg-red-50 text-red-800',
  IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-800',
  DONE: 'border-green-200 bg-green-50 text-green-800',
  NEEDS_CHECK: 'border-purple-200 bg-purple-50 text-purple-800',
}

/**
 * 一覧から対応状況を直接変えるためのプルダウン。
 *
 * 顧客詳細を開かないと変えられないと、溜まった「要確認」を戻すだけで
 * 画面遷移を何度も繰り返すことになる。
 *
 * 「対応済み」はリマインドを止める確定操作なので、**選んだ時点で確認を挟む。**
 * 一覧では行が並んでいて隣の顧客を触りやすく、取り違えると
 * 「対応していない案件のリマインドが止まる」という一番まずい事故になる。
 */
export function StatusSelect({
  customerId,
  customerName,
  value,
  version,
}: {
  customerId: string
  customerName: string
  value: HandlingStatus
  version: number
}) {
  const router = useRouter()
  const [status, setStatus] = useState<HandlingStatus>(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: HandlingStatus): Promise<void> {
    if (next === status) return
    if (next === 'DONE' && !confirm(`${customerName} 様を対応済みにします。以降のリマインドは停止します。`)) {
      return
    }

    const previous = status
    setStatus(next)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handlingStatus: next, version }),
      })
      if (!res.ok) {
        // 失敗したのに変わったように見せない。誰かが同時に触った場合もここに来る
        setStatus(previous)
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(res.status === 409 ? '他の人が更新しました。再読み込みしてください' : (body?.error ?? '更新できませんでした'))
        return
      }
      router.refresh()
    } catch {
      setStatus(previous)
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <select
        className={`rounded-lg border px-2 py-1.5 text-sm font-medium disabled:opacity-50 ${TONE[status]}`}
        value={status}
        disabled={busy}
        aria-label={`${customerName} 様の対応状況`}
        onChange={(e) => void change(e.target.value as HandlingStatus)}
        // 行全体がリンクなので、プルダウンの操作でページ遷移させない
        onClick={(e) => e.stopPropagation()}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
