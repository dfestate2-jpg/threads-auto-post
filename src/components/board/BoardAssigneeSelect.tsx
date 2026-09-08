'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const NONE = ''

/**
 * 一覧から追客の担当者を変えるプルダウン。
 *
 * 変わるのは**追客の担当だけ**で、顧客そのものの担当（リマインドの通知先）は
 * 触らない。片方を引き継いでも、もう片方の動きが変わらないようにしてある。
 *
 * 担当が未設定のまま放置されるとLINEの通知先が無くなるため、
 * そのときだけ配色を変えて目立たせる。
 */
export function BoardAssigneeSelect({
  customerId,
  customerName,
  value,
  staff,
}: {
  customerId: string
  customerName: string
  value: string | null
  staff: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(value ?? NONE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: string): Promise<void> {
    if (next === current) return
    const previous = current
    setCurrent(next)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/board/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, assigneeId: next === NONE ? null : next }),
      })
      if (!res.ok) {
        // 失敗したのに変わったように見せない
        setCurrent(previous)
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? '更新できませんでした')
        return
      }
      router.refresh()
    } catch {
      setCurrent(previous)
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  // 退職などで一覧から消えた担当が付いていることがある。
  // 選択肢に無い値を渡すとブラウザは黙って先頭を選ぶので、別人が担当に見えてしまう
  const extra = current !== NONE && !staff.some((s) => s.id === current)

  return (
    <div>
      <select
        className={`rounded-lg border px-2 py-1.5 text-sm disabled:opacity-50 ${
          current === NONE ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-700'
        }`}
        value={current}
        disabled={busy}
        aria-label={`${customerName} 様の追客担当`}
        onChange={(e) => void change(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value={NONE}>担当 未設定</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        {extra ? <option value={current}>（無効な担当者）</option> : null}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
