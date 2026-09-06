'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const OUTCOMES = [
  { value: 'CONTRACTED', label: 'うちで契約' },
  { value: 'LOST_OTHER', label: '他社で決まった' },
  { value: 'NO_CHANCE', label: '見込みなし' },
] as const

const ANGLES = [
  { value: 5, label: '5 契約しそう', tone: 'border-red-300 bg-red-50 text-red-800' },
  { value: 4, label: '4 有望', tone: 'border-orange-300 bg-orange-50 text-orange-800' },
  { value: 3, label: '3 迷っている', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { value: 2, label: '2 薄い', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { value: 1, label: '1 追わない', tone: 'border-slate-300 bg-slate-100 text-slate-600' },
] as const

type Step = 'idle' | 'angle' | 'outcome'

/**
 * 今日やることの3つのボタン。
 *
 * LINEの通知に付くボタンと**同じ処理を通す**。片方で片付ければもう片方からも
 * 消える、という状態を保つため、判断はすべてサーバー側の1か所に置いてある。
 *
 * 「電話した」のあとに角度を聞き直すのは、温度の変化をそのまま次回の間隔に
 * 反映させるため。設定で切ることもできる。
 */
export function TodayActions({
  entryId,
  customerName,
  askAngleAfterCall,
}: {
  entryId: string
  customerName: string
  askAngleAfterCall: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/board/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, ...payload }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? '更新できませんでした')
        return null
      }
      return (await res.json().catch(() => ({}))) as Record<string, unknown>
    } catch {
      setError('通信に失敗しました')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function onCalled(): Promise<void> {
    // 聞き直す設定なら、まず角度を選ばせる。先に次回をセットすると、
    // 角度を選ばずに離れたときに古い間隔のまま残ってしまう
    if (askAngleAfterCall) {
      setStep('angle')
      return
    }
    if (await send({ action: 'called' })) router.refresh()
  }

  async function onAngle(angle: number): Promise<void> {
    if (await send({ action: 'angle', angle })) {
      setStep('idle')
      router.refresh()
    }
  }

  async function onNoAnswer(): Promise<void> {
    if (await send({ action: 'noanswer' })) router.refresh()
  }

  async function onEnd(outcome: string): Promise<void> {
    if (await send({ action: 'end', outcome })) {
      setStep('idle')
      router.refresh()
    }
  }

  if (step === 'angle') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-600">電話しました。いまの角度は？</p>
        <div className="flex flex-wrap gap-1.5">
          {ANGLES.map((a) => (
            <button
              key={a.value}
              type="button"
              disabled={busy}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${a.tone}`}
              onClick={() => void onAngle(a.value)}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 underline"
            onClick={() => setStep('idle')}
          >
            やめる
          </button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    )
  }

  if (step === 'outcome') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-600">{customerName} 様の追客を終わります。理由は？</p>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
              onClick={() => void onEnd(o.value)}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 underline"
            onClick={() => setStep('idle')}
          >
            やめる
          </button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="btn-primary px-3 py-2 text-sm disabled:opacity-50"
          onClick={() => void onCalled()}
        >
          電話した
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          onClick={() => void onNoAnswer()}
        >
          つながらない
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          onClick={() => setStep('outcome')}
        >
          追客終了
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
