'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface ChannelRow {
  id: string
  name: string
  type: 'LINE_GROUP' | 'LINE_USER' | 'WEBHOOK'
  target: string
  purpose: 'DEFAULT_GROUP' | 'ADMIN' | 'FALLBACK'
  enabled: boolean
}

const TYPES = [
  { value: 'LINE_GROUP', label: 'LINEグループ' },
  { value: 'LINE_USER', label: 'LINE個人' },
  { value: 'WEBHOOK', label: 'Webhook (Slack等)' },
] as const

const PURPOSES = [
  { value: 'DEFAULT_GROUP', label: '社内共通グループ' },
  { value: 'ADMIN', label: '管理者向け' },
  { value: 'FALLBACK', label: '冗長（全滅時）' },
] as const

export function ChannelTable({ initial, envGroupConfigured }: { initial: ChannelRow[]; envGroupConfigured: boolean }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [draft, setDraft] = useState({
    name: '',
    type: 'LINE_GROUP' as ChannelRow['type'],
    target: '',
    purpose: 'DEFAULT_GROUP' as ChannelRow['purpose'],
  })
  const [msg, setMsg] = useState<string | null>(null)

  async function create() {
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const data = (await res.json()) as { error?: string; channel?: ChannelRow }
    if (!res.ok || !data.channel) {
      setMsg(data.error ?? '登録に失敗しました')
      return
    }
    setRows((prev) => [...prev, data.channel as ChannelRow])
    setDraft({ name: '', type: 'LINE_GROUP', target: '', purpose: 'DEFAULT_GROUP' })
    router.refresh()
  }

  async function remove(id: string) {
    await fetch(`/api/channels/${id}`, { method: 'DELETE' })
    setRows((prev) => prev.filter((r) => r.id !== id))
    router.refresh()
  }

  async function test(id: string) {
    setMsg('テスト送信中…')
    const res = await fetch(`/api/channels/${id}/test`, { method: 'POST' })
    const data = (await res.json()) as { ok?: boolean; results?: { ok: boolean; error: string | null }[] }
    setMsg(data.ok ? '✅ テスト送信に成功しました' : `❌ 送信失敗: ${data.results?.[0]?.error ?? '不明なエラー'}`)
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-bold">通知チャネル</h2>
      <p className="mb-4 text-xs text-slate-500">
        担当者が未設定の顧客は「社内共通グループ」へ通知されます。設定を保存したら必ずテスト送信で疎通を確認してください。
      </p>

      {rows.length === 0 && !envGroupConfigured ? (
        <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          ⚠️ 通知先が1件も登録されていません。担当者未設定の顧客のリマインドが届きません。
        </p>
      ) : null}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2">名前</th>
            <th>種別</th>
            <th>宛先</th>
            <th>用途</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2">{r.name}</td>
              <td className="text-xs">{TYPES.find((t) => t.value === r.type)?.label}</td>
              <td className="max-w-[240px] truncate font-mono text-xs text-slate-500" title={r.target}>
                {r.target}
              </td>
              <td className="text-xs">{PURPOSES.find((p) => p.value === r.purpose)?.label}</td>
              <td className="space-x-3 text-right text-xs">
                <button className="text-slate-600 hover:underline" onClick={() => test(r.id)}>
                  テスト送信
                </button>
                <button className="text-red-600 hover:underline" onClick={() => remove(r.id)}>
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <div>
          <label className="label">名前</label>
          <input className="input w-40" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label className="label">種別</label>
          <select className="input w-40" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ChannelRow['type'] })}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">宛先（groupId / userId / URL）</label>
          <input className="input w-64 font-mono text-xs" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
        </div>
        <div>
          <label className="label">用途</label>
          <select
            className="input w-44"
            value={draft.purpose}
            onChange={(e) => setDraft({ ...draft, purpose: e.target.value as ChannelRow['purpose'] })}
          >
            {PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={create}>
          追加
        </button>
        {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
      </div>
    </section>
  )
}
