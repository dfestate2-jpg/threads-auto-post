'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const DAYS = [
  { key: 'mon', label: '月' },
  { key: 'tue', label: '火' },
  { key: 'wed', label: '水' },
  { key: 'thu', label: '木' },
  { key: 'fri', label: '金' },
  { key: 'sat', label: '土' },
  { key: 'sun', label: '日' },
] as const

type DayKey = (typeof DAYS)[number]['key']
type DayHours = { enabled: boolean; open: string; close: string }

export interface GeneralSettings {
  timezone: string
  defaultReminderIntervalMinutes: number
  firstReminderDelayMinutes: number
  maxRemindersPerCycle: number
  businessHours: Record<string, DayHours>
  respectBusinessHours: boolean
  openOnPublicHolidays: boolean
  countBusinessHoursOnly: boolean
  maxSilenceGuardMinutes: number
  watchdogDelayMinutes: number
  alwaysNotifyDefaultGroup: boolean
  includeMessageBodyInNotification: boolean
  messageExcerptLength: number
}

export function GeneralForm({ initial }: { initial: GeneralSettings }) {
  const router = useRouter()
  const [s, setS] = useState<GeneralSettings>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function setDay(day: DayKey, patch: Partial<DayHours>) {
    setS((prev) => ({
      ...prev,
      businessHours: { ...prev.businessHours, [day]: { ...(prev.businessHours[day] as DayHours), ...patch } },
    }))
  }

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const data = (await res.json()) as { error?: string; rescheduled?: number }
      setMsg(res.ok ? `保存しました（${data.rescheduled ?? 0}件の予定を再計算）` : (data.error ?? '保存に失敗しました'))
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="mb-4 text-sm font-bold">基本設定</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">既定のリマインド間隔</label>
          <select
            className="input"
            value={s.defaultReminderIntervalMinutes}
            onChange={(e) => setS({ ...s, defaultReminderIntervalMinutes: Number(e.target.value) })}
          >
            <option value={60}>1時間ごと</option>
            <option value={120}>2時間ごと</option>
            <option value={180}>3時間ごと</option>
            <option value={0}>通知しない</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">顧客ごとに個別設定で上書きできます。</p>
        </div>

        <div>
          <label className="label">初回リマインドまでの時間（分）</label>
          <input
            className="input"
            type="number"
            min={1}
            value={s.firstReminderDelayMinutes}
            onChange={(e) => setS({ ...s, firstReminderDelayMinutes: Number(e.target.value) })}
          />
          <p className="mt-1 text-xs text-slate-500">顧客のメッセージ受信からこの時間で1回目を通知します。</p>
        </div>

        <div>
          <label className="label">無通知の上限（分）</label>
          <input
            className="input"
            type="number"
            min={0}
            value={s.maxSilenceGuardMinutes}
            onChange={(e) => setS({ ...s, maxSilenceGuardMinutes: Number(e.target.value) })}
          />
          <p className="mt-1 text-xs text-slate-500">
            顧客が短い間隔でメッセージを送り続けても、返信が無い限りこの時間を超えて無通知にはなりません（見逃し防止）。0で無効。
          </p>
        </div>

        <div>
          <label className="label">1サイクルの最大通知回数</label>
          <input
            className="input"
            type="number"
            min={0}
            value={s.maxRemindersPerCycle}
            onChange={(e) => setS({ ...s, maxRemindersPerCycle: Number(e.target.value) })}
          />
          <p className="mt-1 text-xs text-slate-500">0 = 無制限（推奨）。上限に達すると通知が止まるため注意してください。</p>
        </div>

        <div>
          <label className="label">タイムゾーン</label>
          <input className="input" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} />
        </div>

        <div>
          <label className="label">通知に載せるメッセージの文字数</label>
          <input
            className="input"
            type="number"
            min={10}
            max={500}
            value={s.messageExcerptLength}
            onChange={(e) => setS({ ...s, messageExcerptLength: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        {(
          [
            ['respectBusinessHours', '営業時間外はリマインドを停止し、翌営業日に再開する'],
            ['countBusinessHoursOnly', '未返信の経過時間を営業時間だけで数える'],
            ['openOnPublicHolidays', '祝日も営業する'],
            ['alwaysNotifyDefaultGroup', '担当者が決まっていても、社内共通の通知先へ同報する（事務など担当者以外も返信する場合）'],
            ['includeMessageBodyInNotification', '通知に顧客メッセージの本文を含める'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={s[key]} onChange={(e) => setS({ ...s, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <h3 className="mb-2 text-sm font-bold">営業時間</h3>
        <div className="space-y-2">
          {DAYS.map((d) => {
            const h = (s.businessHours[d.key] as DayHours | undefined) ?? { enabled: false, open: '09:00', close: '20:00' }
            return (
              <div key={d.key} className="flex items-center gap-3 text-sm">
                <label className="flex w-20 items-center gap-2">
                  <input type="checkbox" checked={h.enabled} onChange={(e) => setDay(d.key, { enabled: e.target.checked })} />
                  <span className={d.key === 'sun' ? 'text-red-600' : d.key === 'sat' ? 'text-blue-600' : ''}>{d.label}曜</span>
                </label>
                <input
                  className="input w-28"
                  type="time"
                  value={h.open}
                  disabled={!h.enabled}
                  onChange={(e) => setDay(d.key, { open: e.target.value })}
                />
                <span className="text-slate-400">〜</span>
                <input
                  className="input w-28"
                  type="time"
                  value={h.close}
                  disabled={!h.enabled}
                  onChange={(e) => setDay(d.key, { close: e.target.value })}
                />
                {!h.enabled ? <span className="text-xs text-slate-400">休業</span> : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? '保存中…' : '基本設定を保存'}
        </button>
        {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
      </div>
    </section>
  )
}
