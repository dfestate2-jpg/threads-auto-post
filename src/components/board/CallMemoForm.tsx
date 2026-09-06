'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const ANGLES = [
  { value: 5, label: '5', note: 'うちで契約しそう', tone: 'border-red-300 bg-red-50 text-red-800' },
  { value: 4, label: '4', note: '有望', tone: 'border-orange-300 bg-orange-50 text-orange-800' },
  { value: 3, label: '3', note: '迷っている', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { value: 2, label: '2', note: '薄い', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { value: 1, label: '1', note: '追わない', tone: 'border-slate-300 bg-slate-100 text-slate-600' },
] as const

export interface CustomerOption {
  id: string
  name: string
  phone: string | null
}

/**
 * 通話メモ。電話が終わって30秒で終わることを最優先にしてある。
 *
 * 期限を入力させないのが一番の変更点。角度を選んだ時点で次回追客日が決まり、
 * 「いつ通知するか」がその場に出る。前のボードで「期限なし」ばかりになったのは、
 * 任意項目なうえに何日後にすべきか考えないと書けなかったため。
 */
export function CallMemoForm({
  customers,
  staff,
  defaultStaffId,
  today,
}: {
  customers: CustomerOption[]
  staff: { id: string; name: string }[]
  defaultStaffId: string | null
  today: string
}) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [calledOn, setCalledOn] = useState(today)
  const [staffId, setStaffId] = useState(defaultStaffId ?? '')
  const [angle, setAngle] = useState<number | null>(null)
  const [customerTask, setCustomerTask] = useState('')
  const [staffTask, setStaffTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const picked = customers.find((c) => c.id === customerId)

  async function submit(): Promise<void> {
    if (angle === null) {
      setError('角度を選んでください')
      return
    }
    if (!customerId && customerName.trim() === '') {
      setError('お客様を選ぶか、お名前を入力してください')
      return
    }

    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/board/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(customerId ? { customerId } : { customerName: customerName.trim() }),
          // 日付だけの入力を、その日の正午として送る。時刻のずれで前日になるのを防ぐ
          calledOn: new Date(`${calledOn}T12:00:00+09:00`).toISOString(),
          staffId: staffId || null,
          angle,
          customerTask: customerTask.trim() || null,
          staffTask: staffTask.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? '登録できませんでした')
        return
      }
      const body = (await res.json().catch(() => null)) as { dueAt?: string | null; ended?: boolean } | null
      setDone(
        body?.ended
          ? '登録しました。この角度では追客しません'
          : body?.dueAt
            ? `登録しました。${formatDue(body.dueAt)}に通知します`
            : '登録しました。この角度では追客しません',
      )
      setCustomerId('')
      setCustomerName('')
      setAngle(null)
      setCustomerTask('')
      setStaffTask('')
      router.refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="cm-customer">
          お客様
        </label>
        <select
          id="cm-customer"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">（一覧にない・新しく登録する）</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? `（${c.phone}）` : ''}
            </option>
          ))}
        </select>
        {!customerId ? (
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="お名前（例：たなか@賃貸希望）"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        ) : picked?.phone ? (
          <p className="text-xs text-slate-500">{picked.phone}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="cm-date">
            電話した日
          </label>
          <input
            id="cm-date"
            type="date"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={calledOn}
            onChange={(e) => setCalledOn(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="cm-staff">
            担当者
          </label>
          <select
            id="cm-staff"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">担当なし</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="cm-ctask">
          お客さんのタスク <span className="text-slate-400">（任意）</span>
        </label>
        <textarea
          id="cm-ctask"
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="例）気になる物件の見積書を持ってくる"
          value={customerTask}
          onChange={(e) => setCustomerTask(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="cm-stask">
          営業マンのタスク <span className="text-slate-400">（任意）</span>
        </label>
        <textarea
          id="cm-stask"
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="例）審査状況を管理会社に確認"
          value={staffTask}
          onChange={(e) => setStaffTask(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">お客さんの熱意角度</span>
        <div className="flex flex-wrap gap-2">
          {ANGLES.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-pressed={angle === a.value}
              className={`flex flex-col items-center rounded-xl border px-3 py-2 text-sm font-bold ${a.tone} ${
                angle === a.value ? 'ring-2 ring-slate-900 ring-offset-1' : 'opacity-70'
              }`}
              onClick={() => setAngle(a.value)}
            >
              <span className="text-base">{a.label}</span>
              <span className="text-[11px] font-normal">{a.note}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          角度を選ぶと、次にいつ追うかが自動で決まります。期限を考える必要はありません。
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {done ? <p className="text-sm font-medium text-emerald-700">{done}</p> : null}

      <button type="button" className="btn-primary w-full px-4 py-3 text-base disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
        登録する
      </button>
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
