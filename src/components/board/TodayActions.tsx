'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const OUTCOMES = [
  { value: 'CONTRACTED', label: 'うちで契約' },
  { value: 'LOST_OTHER', label: '他社で契約' },
  { value: 'NO_CHANCE', label: '見込みなし' },
] as const

const ANGLES = [
  { value: 5, label: '5 契約しそう', tone: 'border-red-300 bg-red-50 text-red-800' },
  { value: 4, label: '4 有望', tone: 'border-orange-300 bg-orange-50 text-orange-800' },
  { value: 3, label: '3 迷っている', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { value: 2, label: '2 薄い', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { value: 1, label: '1 追わない', tone: 'border-slate-300 bg-slate-100 text-slate-600' },
] as const

type Step = 'idle' | 'angle' | 'outcome' | 'done'

/** 押したあと画面から消えるまでの間。次回日を読む時間を残す */
const DONE_MS = 2600

/**
 * 今日やることの3つのボタン。
 *
 * LINEの通知に付くボタンと**同じ処理を通す**。片方で片付ければもう片方からも
 * 消える、という状態を保つため、判断はすべてサーバー側の1か所に置いてある。
 *
 * 押した直後に**次回の追客日を出す**のが要点。押すと行が消えるので、
 * 何も出さないと「連絡したらこの人は終わり」に見えてしまう。実際は
 * 追客終了を押すまで何度でも戻ってくるので、それを毎回その場で見せる。
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
  const [doneText, setDoneText] = useState<string | null>(null)

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

  /** 結果を見せてから、少し置いて一覧を更新する */
  function finish(text: string): void {
    setDoneText(text)
    setStep('done')
    setTimeout(() => router.refresh(), DONE_MS)
  }

  function nextText(body: Record<string, unknown> | null, prefix: string): string {
    const dueAt = typeof body?.dueAt === 'string' ? body.dueAt : null
    if (!dueAt) return `${prefix}。次の追客は予定されていません`
    return `${prefix}。次は ${formatDue(dueAt)} にまた出ます`
  }

  async function onDone(): Promise<void> {
    // 聞き直す設定なら、まず角度を選ばせる。先に次回をセットすると、
    // 角度を選ばずに離れたときに古い間隔のまま残ってしまう
    if (askAngleAfterCall) {
      setStep('angle')
      return
    }
    const body = await send({ action: 'called' })
    if (body) finish(nextText(body, '対応済みにしました'))
  }

  async function onAngle(angle: number): Promise<void> {
    const body = await send({ action: 'angle', angle })
    if (body) finish(nextText(body, `対応済み・角度${angle}`))
  }

  async function onNoAnswer(): Promise<void> {
    const body = await send({ action: 'noanswer' })
    if (body) finish(nextText(body, 'つながらなかった'))
  }

  async function onEnd(outcome: string, label: string): Promise<void> {
    const body = await send({ action: 'end', outcome })
    if (body) finish(`追客を終了しました（${label}）。今日やることと顧客一覧の両方から外れます`)
  }

  if (step === 'done') {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
        ✓ {doneText}
      </p>
    )
  }

  if (step === 'angle') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-600">対応しました。いまの角度は？</p>
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
        <p className="text-xs text-slate-600">
          {customerName} 様の追客を<strong>終わります</strong>。理由は？
        </p>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
              onClick={() => void onEnd(o.value, o.label)}
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
        <p className="text-[11px] text-slate-500">
          終了すると、今日やることにもLINEにも出なくなります。顧客一覧のステータスも
          「うちで契約」なら成約、それ以外は失注に変わり、未返信リマインドの対象からも外れます。
        </p>
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
          onClick={() => void onDone()}
        >
          対応済み
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

function formatDue(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(iso))
}
