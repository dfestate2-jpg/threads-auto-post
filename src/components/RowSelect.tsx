'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface RowSelectOption {
  value: string
  label: string
}

/**
 * 一覧の行から顧客の属性を直接変えるためのプルダウン。
 *
 * 詳細画面を開かないと変えられないと、溜まった「要確認」を戻すだけ、
 * 担当を割り振るだけで画面遷移を何度も繰り返すことになる。
 *
 * 状況用と担当者用で中身は違うが、**失敗したときの振る舞いは同じでなければ
 * いけない**。片方だけ「失敗しても選択が戻らない」といった差が出ると、
 * 変えたつもりで変わっていない状態に気づけない。そこで通信と復元をここに集約する。
 */
export function RowSelect({
  customerId,
  value,
  options,
  version,
  ariaLabel,
  tone,
  buildPayload,
  confirmMessage,
}: {
  customerId: string
  value: string
  options: RowSelectOption[]
  /**
   * 楽観ロック用。同時操作の上書きを防ぐ。
   *
   * LINE を使っていない顧客（電話・ポータル経由の反響）には会話が無く、
   * 突き合わせる version が存在しない。そこは null を渡して照合を省く。
   * **0 を代わりに送ってはいけない** — 会話の version は 0 から始まるので、
   * 実際には古い画面を見ているのに照合が通ってしまう。
   */
  version: number | null
  ariaLabel: string
  /** 選択中の値に応じた配色。一覧で状態を色で判別できるようにする */
  tone?: (value: string) => string
  buildPayload: (next: string) => Record<string, unknown>
  /** 確定操作のときだけ確認を挟む。null を返せば確認しない */
  confirmMessage?: (next: string) => string | null
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: string): Promise<void> {
    if (next === current) return
    const message = confirmMessage?.(next)
    if (message && !confirm(message)) return

    const previous = current
    setCurrent(next)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(next), ...(version === null ? {} : { version }) }),
      })
      if (!res.ok) {
        // 失敗したのに変わったように見せない。誰かが同時に触った場合もここに来る
        setCurrent(previous)
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(
          res.status === 409
            ? '他の人が更新しました。再読み込みしてください'
            : (body?.error ?? '更新できませんでした'),
        )
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

  return (
    <div>
      <select
        className={`rounded-lg border px-2 py-1.5 text-sm font-medium disabled:opacity-50 ${tone?.(current) ?? 'border-slate-200 bg-white text-slate-700'}`}
        value={current}
        disabled={busy}
        aria-label={ariaLabel}
        onChange={(e) => void change(e.target.value)}
        // 行全体がリンクなので、プルダウンの操作でページ遷移させない
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
