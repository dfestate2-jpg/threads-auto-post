'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const NONE = ''

/** 角度ごとの色。低いほど冷たく、高いほど熱い。一覧で温度が一目で分かるようにする */
const TONE: Record<string, string> = {
  [NONE]: 'border-slate-200 bg-white text-slate-500',
  '1': 'border-slate-300 bg-slate-100 text-slate-600',
  '2': 'border-emerald-200 bg-emerald-50 text-emerald-800',
  '3': 'border-amber-200 bg-amber-50 text-amber-800',
  '4': 'border-orange-300 bg-orange-50 text-orange-800',
  '5': 'border-red-300 bg-red-50 text-red-800',
}

const LABEL: Record<string, string> = {
  [NONE]: '角度なし',
  '1': '1 追わない',
  '2': '2 薄い',
  '3': '3 迷っている',
  '4': '4 有望',
  '5': '5 契約しそう',
}

/**
 * 一覧の行から角度を直接つけるプルダウン。
 *
 * **これが「電話していなくても追客に入れる」入口。**
 * 選んだ瞬間に次回追客日が決まり、今日やることとLINEの両方に出るようになる。
 * 確認ダイアログは挟まない——いつでも戻せる操作で、毎回確認を出すと
 * 「その場でさっと拾う」という狙いを潰してしまう。
 */
export function AngleSelect({
  customerId,
  customerName,
  value,
}: {
  customerId: string
  customerName: string
  value: number | null
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(value === null ? NONE : String(value))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function change(next: string): Promise<void> {
    if (next === current) return
    const previous = current
    setCurrent(next)
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/board/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, angle: next === NONE ? null : Number(next) }),
      })
      if (!res.ok) {
        // 失敗したのに変わったように見せない
        setCurrent(previous)
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? '更新できませんでした')
        return
      }
      // いつ通知が来るかをその場で見せる。期限を自分で考える手間が消える
      const body = (await res.json().catch(() => null)) as { dueAt?: string | null } | null
      setNotice(body?.dueAt ? `${formatDue(body.dueAt)}に通知します` : null)
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
        className={`rounded-lg border px-2 py-1.5 text-sm font-medium disabled:opacity-50 ${TONE[current] ?? TONE[NONE]}`}
        value={current}
        disabled={busy}
        aria-label={`${customerName} 様の角度`}
        onChange={(e) => void change(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        {[NONE, '1', '2', '3', '4', '5'].map((v) => (
          <option key={v || 'none'} value={v}>
            {LABEL[v]}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      {notice ? <p className="mt-1 text-xs text-emerald-700">{notice}</p> : null}
    </div>
  )
}

function formatDue(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(d)
}
