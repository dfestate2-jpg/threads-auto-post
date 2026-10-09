'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * 「対応中なので鳴らしていない」ことを一覧に出す。
 *
 * **黙っている理由が見えないのが一番危ない。** 通知が来ないことと、
 * 通知を止めていることは画面上で区別できなければならない。
 * 止めていると分かれば、期限を待たずに戻すこともできる。
 */
export function InProgressBadge({
  customerId,
  customerName,
  until,
  timezone,
  version,
}: {
  customerId: string
  customerName: string
  until: Date
  timezone: string
  version: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(until)

  async function release(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseInProgress: true, version }),
      })
      if (!res.ok) {
        setError(res.status === 409 ? '他の人が更新しました。再読み込みしてください' : '戻せませんでした')
        return
      }
      router.refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <span
        className="whitespace-nowrap rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
        title={`${customerName} は対応中のため、${label} までリマインドしません`}
      >
        🔇 対応中 {label}まで
      </span>
      <button
        type="button"
        className="whitespace-nowrap text-xs text-slate-500 underline disabled:opacity-50"
        disabled={busy}
        onClick={() => void release()}
      >
        監視に戻す
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  )
}
