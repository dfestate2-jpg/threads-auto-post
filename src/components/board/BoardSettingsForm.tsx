'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface BoardSettingsValues {
  angle5Ladder: string
  angle4Ladder: string
  angle3Ladder: string
  angle2Ladder: string
  angle1Ladder: string
  notifyHour: number
  notifyMinute: number
  notifyToStaff: boolean
  notifyToGroup: boolean
  dailyLimit: number
  askAngleAfterCall: boolean
  messageTemplate: string
}

const LADDERS: { key: keyof BoardSettingsValues; angle: number; note: string }[] = [
  { key: 'angle5Ladder', angle: 5, note: 'うちで契約しそう' },
  { key: 'angle4Ladder', angle: 4, note: '有望' },
  { key: 'angle3Ladder', angle: 3, note: '迷っている' },
  { key: 'angle2Ladder', angle: 2, note: '薄い' },
  { key: 'angle1Ladder', angle: 1, note: '変な顧客／他社で契約しそう' },
]

/**
 * 追客の設定。
 *
 * 数字を変えるのに開発を待たなくてよい状態を保つための画面。
 * 営業感覚とズレたら、ここで直せる。
 */
export function BoardSettingsForm({ initial }: { initial: BoardSettingsValues }) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function set<K extends keyof BoardSettingsValues>(key: K, value: BoardSettingsValues[K]): void {
    setValues((v) => ({ ...v, [key]: value }))
    setDone(false)
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/board/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, messageTemplate: values.messageTemplate.trim() || null }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? '保存できませんでした')
        return
      }
      setDone(true)
      router.refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-bold">追客の間隔</h2>
          <p className="mt-1 text-sm text-slate-600">
            カンマ区切りで「何日後に追うか」を並べます。反応がないほど右へ進みます。
            最後の数字はそのまま繰り返し、末尾に <code className="rounded bg-slate-100 px-1">end</code> を書くと打ち切ります。
            <code className="rounded bg-slate-100 px-1">off</code> は追いません。
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {LADDERS.map((l) => (
            <div key={l.key} className="flex flex-wrap items-center gap-3">
              <label className="w-40 shrink-0 text-sm" htmlFor={`ladder-${l.angle}`}>
                <span className="font-bold">角度{l.angle}</span>
                <span className="ml-2 text-xs text-slate-500">{l.note}</span>
              </label>
              <input
                id={`ladder-${l.angle}`}
                className="w-44 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                value={values[l.key] as string}
                onChange={(e) => set(l.key, e.target.value as never)}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          例：<code className="rounded bg-slate-100 px-1">3,5,7</code> → 3日後、反応がなければ5日後、以降は7日おき
        </p>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="text-base font-bold">通知</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="w-40 shrink-0 text-sm font-bold" htmlFor="notify-hour">
            送る時刻
          </label>
          <input
            id="notify-hour"
            type="number"
            min={0}
            max={23}
            className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={values.notifyHour}
            onChange={(e) => set('notifyHour', Number(e.target.value))}
          />
          <span className="text-sm">時</span>
          <input
            type="number"
            min={0}
            max={59}
            className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={values.notifyMinute}
            onChange={(e) => set('notifyMinute', Number(e.target.value))}
            aria-label="通知する分"
          />
          <span className="text-sm">分</span>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.notifyToStaff}
            onChange={(e) => set('notifyToStaff', e.target.checked)}
          />
          担当者個人のLINEへ送る
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.notifyToGroup}
            onChange={(e) => set('notifyToGroup', e.target.checked)}
          />
          社内グループへも送る
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <label className="w-40 shrink-0 text-sm font-bold" htmlFor="daily-limit">
            1人1日の上限
          </label>
          <input
            id="daily-limit"
            type="number"
            min={1}
            max={200}
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={values.dailyLimit}
            onChange={(e) => set('dailyLimit', Number(e.target.value))}
          />
          <span className="text-xs text-slate-500">通</span>
        </div>
        <p className="text-xs text-slate-500">
          上限を超えた分は送らず、今日やることに残ります。1人に大量に飛ぶと通知そのものが読まれなくなるためです。
        </p>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="text-base font-bold">操作</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.askAngleAfterCall}
            onChange={(e) => set('askAngleAfterCall', e.target.checked)}
          />
          「電話した」のあとに角度を聞き直す
        </label>
        <p className="text-xs text-slate-500">
          外すとタップは1回で済みますが、温度が変わっても前の間隔のまま追い続けます。
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-base font-bold">通知の文面</h2>
        <textarea
          rows={6}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
          placeholder="空にすると既定の文面に戻ります"
          value={values.messageTemplate}
          onChange={(e) => set('messageTemplate', e.target.value)}
        />
        <p className="text-xs text-slate-500">
          使える差し込み：{'{顧客名}'} {'{角度}'} {'{角度の意味}'} {'{経過}'} {'{タスク}'} {'{お客さんのタスク}'}{' '}
          {'{自分のタスク}'} {'{電話番号}'}
        </p>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {done ? <p className="text-sm font-medium text-emerald-700">保存しました</p> : null}

      <button type="button" className="btn-primary px-4 py-3 text-base disabled:opacity-50" disabled={busy} onClick={() => void save()}>
        保存する
      </button>
    </div>
  )
}
