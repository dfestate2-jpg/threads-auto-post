'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { REMINDER_INTERVAL_OPTIONS } from '@/lib/services/policy'

interface CustomerProps {
  id: string
  name: string | null
  lineUserId: string
  displayName: string | null
  assigneeId: string | null
  reminderIntervalMinutes: number | null
  note: string | null
  blocked: boolean
}

interface ConversationProps {
  version: number
  handlingStatus: string
  replyState: string
  reminderCount: number
  nextReminderAtLabel: string
  resolvedAtLabel: string
  lastInboundAtLabel: string
  lastOutboundAtLabel: string
}

const STATUS_OPTIONS = [
  { value: 'UNHANDLED', label: '未対応' },
  { value: 'IN_PROGRESS', label: '対応中' },
  { value: 'DONE', label: '対応済み' },
  { value: 'NEEDS_CHECK', label: '要確認' },
]

export function CustomerPanel({
  customer,
  conversation,
  staff,
  defaultIntervalMinutes,
}: {
  customer: CustomerProps
  conversation: ConversationProps | null
  staff: { id: string; name: string }[]
  defaultIntervalMinutes: number
}) {
  const router = useRouter()
  const [name, setName] = useState(customer.name ?? '')
  const [note, setNote] = useState(customer.note ?? '')
  const [assigneeId, setAssigneeId] = useState(customer.assigneeId ?? '')
  const [interval, setIntervalValue] = useState<string>(
    customer.reminderIntervalMinutes === null ? '' : String(customer.reminderIntervalMinutes),
  )
  const [status, setStatus] = useState(conversation?.handlingStatus ?? 'UNHANDLED')
  const [replyText, setReplyText] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(url: string, body: unknown, method: 'POST' | 'PATCH') {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? '処理に失敗しました' })
        return false
      }
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function saveDetails() {
    const ok = await post(
      `/api/customers/${customer.id}`,
      {
        name: name.trim() === '' ? null : name.trim(),
        note: note.trim() === '' ? null : note.trim(),
        assigneeId: assigneeId === '' ? null : assigneeId,
        reminderIntervalMinutes: interval === '' ? null : Number(interval),
        version: conversation?.version,
      },
      'PATCH',
    )
    if (ok) setMessage({ type: 'ok', text: '保存しました' })
  }

  async function saveStatus(next: string) {
    setStatus(next)
    const ok = await post(
      `/api/customers/${customer.id}`,
      { handlingStatus: next, version: conversation?.version },
      'PATCH',
    )
    if (ok) {
      setMessage({
        type: 'ok',
        text: next === 'DONE' ? '対応済みにしました。以降のリマインドは停止します' : '対応状況を更新しました',
      })
    }
  }

  async function sendReply() {
    if (replyText.trim() === '') return
    const ok = await post(`/api/customers/${customer.id}/reply`, { text: replyText }, 'POST')
    if (ok) {
      setReplyText('')
      setMessage({ type: 'ok', text: 'LINEへ返信を送信し、対応済みにしました' })
    }
  }

  async function resolveManually() {
    const ok = await post(
      `/api/customers/${customer.id}/resolve`,
      { note: 'LINE公式アカウントManagerから返信済み', version: conversation?.version },
      'POST',
    )
    if (ok) setMessage({ type: 'ok', text: '対応済みにしました。以降のリマインドは停止します' })
  }

  return (
    <>
      {/* --- 返信（返信検知の主経路） --- */}
      <section className="card p-4">
        <h2 className="mb-1 text-sm font-bold">顧客へ返信</h2>
        <p className="mb-3 text-xs text-slate-500">
          ここから返信すると、LINEへの送信と「対応済み」への切り替えが同時に行われ、リマインドが確実に止まります。
        </p>
        <textarea
          className="input h-28 resize-y"
          placeholder="返信内容を入力"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          disabled={customer.blocked}
        />
        <button className="btn-primary mt-2 w-full" onClick={sendReply} disabled={busy || customer.blocked || replyText.trim() === ''}>
          LINEへ送信して対応済みにする
        </button>
        {customer.blocked ? (
          <p className="mt-2 text-xs text-red-600">この顧客にブロックされているため送信できません。</p>
        ) : null}
        <button className="btn-secondary mt-2 w-full" onClick={resolveManually} disabled={busy}>
          LINE公式Managerで返信済み → 対応済みにする
        </button>
      </section>

      {message ? (
        <p
          className={`rounded px-3 py-2 text-sm ${
            message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {/* --- 対応状況 --- */}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">対応状況</h2>
        <select className="input" value={status} onChange={(e) => saveStatus(e.target.value)} disabled={busy}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <dl className="mt-4 space-y-1 text-xs text-slate-600">
          <div className="flex justify-between">
            <dt>未返信状態</dt>
            <dd className={conversation?.replyState === 'AWAITING' ? 'font-semibold text-red-600' : ''}>
              {conversation?.replyState === 'AWAITING' ? '未返信' : '返信済み'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>リマインド回数</dt>
            <dd>{conversation?.reminderCount ?? 0}回</dd>
          </div>
          <div className="flex justify-between">
            <dt>次回リマインド</dt>
            <dd>{conversation?.nextReminderAtLabel ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>最終受信</dt>
            <dd>{conversation?.lastInboundAtLabel ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>最終返信</dt>
            <dd>{conversation?.lastOutboundAtLabel ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>対応済み日時</dt>
            <dd>{conversation?.resolvedAtLabel ?? '—'}</dd>
          </div>
        </dl>
      </section>

      {/* --- 顧客情報・担当者・通知設定 --- */}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">顧客情報</h2>
        <div className="space-y-3">
          <div>
            <label className="label">顧客名</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={customer.displayName ?? ''} />
          </div>
          <div>
            <label className="label">LINEユーザーID</label>
            <p className="break-all rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">{customer.lineUserId}</p>
          </div>
          <div>
            <label className="label">担当者</label>
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">未設定（社内共通グループへ通知）</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">リマインド間隔</label>
            <select className="input" value={interval} onChange={(e) => setIntervalValue(e.target.value)}>
              <option value="">
                全体設定に従う（{REMINDER_INTERVAL_OPTIONS.find((o) => o.value === defaultIntervalMinutes)?.label ?? `${defaultIntervalMinutes}分ごと`}）
              </option>
              {REMINDER_INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {interval === '0' ? (
              <p className="mt-1 text-xs text-orange-600">この顧客にはリマインドが送られなくなります。</p>
            ) : null}
          </div>
          <div>
            <label className="label">メモ</label>
            <textarea className="input h-20 resize-y" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn-primary w-full" onClick={saveDetails} disabled={busy}>
            保存
          </button>
        </div>
      </section>
    </>
  )
}
