'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  DEFAULT_NOTIFICATION_TEMPLATE,
  TEMPLATE_PLACEHOLDERS,
  renderNotificationTemplate,
} from '@/lib/domain/notificationText'

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
  digestRepeatReminders: boolean
  includeMessageBodyInNotification: boolean
  messageExcerptLength: number
  notificationTemplate: string | null
}

/**
 * 編集中の文面がどう届くかを、その場で見せるための見本。
 *
 * URLだけは実際の公開URL（APP_BASE_URL）から組み立てる。
 * 見本にURLを直接書いておくと、独自ドメインに変えたときに
 * 見本だけ古いURLのままになり、設定画面が嘘をつくことになる。
 * 組み立て方は services/reminderRunner の detailUrl と揃えてある。
 */
function previewValues(appBaseUrl: string): Record<string, string> {
  return {
    '{印}': '⚠️',
    '{経過時間}': '1時間20分',
    '{補足}': '',
    '{顧客名}': '山田太郎',
    '{担当者}': '内田翔太',
    '{メッセージ}': '内見の件ですが、来週の土曜日は空いていますでしょうか？',
    '{URL}': appBaseUrl ? `${appBaseUrl.replace(/\/$/, '')}/customers/abc123` : '',
  }
}

export function GeneralForm({ initial, appBaseUrl }: { initial: GeneralSettings; appBaseUrl: string }) {
  const router = useRouter()
  const [s, setS] = useState<GeneralSettings>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const preview = previewValues(appBaseUrl)

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
            [
              'digestRepeatReminders',
              '2回目以降のリマインドを1通にまとめる（初回とエスカレーションはボタン付きの個別通知のまま）',
            ],
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
        <h3 className="mb-1 text-sm font-bold">リマインドの文面</h3>
        <p className="mb-2 text-xs text-slate-500">
          社内LINEに届くリマインドの本文です。空にすると既定の文面に戻ります。
          ボタン（対応済み・自分が担当）は文面に関係なく常に付きます。
        </p>
        <textarea
          className="input font-mono"
          rows={7}
          value={s.notificationTemplate ?? DEFAULT_NOTIFICATION_TEMPLATE}
          onChange={(e) => setS({ ...s, notificationTemplate: e.target.value })}
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <span key={p.key}>
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">{p.key}</code> {p.description}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-2"
          onClick={() => setS({ ...s, notificationTemplate: DEFAULT_NOTIFICATION_TEMPLATE })}
        >
          既定の文面に戻す
        </button>

        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-slate-600">届く見本</div>
          {!appBaseUrl ? (
            <p className="mb-1 text-xs text-orange-700">
              サイトのURL（APP_BASE_URL）が未設定のため、通知に管理画面へのリンクが載りません。
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
            {renderNotificationTemplate(
              (s.notificationTemplate ?? '').trim() || DEFAULT_NOTIFICATION_TEMPLATE,
              {
                ...preview,
                '{メッセージ}': s.includeMessageBodyInNotification
                  ? preview['{メッセージ}']!.slice(0, s.messageExcerptLength)
                  : '',
              },
            )}
          </pre>
        </div>
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
