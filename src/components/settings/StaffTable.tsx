'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface StaffRow {
  id: string
  name: string
  lineUserId: string | null
  email: string | null
  role: 'STAFF' | 'MANAGER' | 'ADMIN'
  managerId: string | null
  notifyEnabled: boolean
  active: boolean
}

const ROLES = [
  { value: 'STAFF', label: '担当者' },
  { value: 'MANAGER', label: '責任者' },
  { value: 'ADMIN', label: '管理者' },
] as const

export function StaffTable({ initial }: { initial: StaffRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [draft, setDraft] = useState({ name: '', lineUserId: '', role: 'STAFF' as StaffRow['role'] })
  const [msg, setMsg] = useState<string | null>(null)
  const [codes, setCodes] = useState<Record<string, { display: string; expiresAt: string }>>({})

  async function patch(id: string, body: Partial<StaffRow>) {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { error?: string; staff?: StaffRow }
    if (!res.ok) {
      setMsg(data.error ?? '更新に失敗しました')
      return
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...body } : r)))
    setMsg('更新しました')
    router.refresh()
  }

  async function issueCode(id: string) {
    const res = await fetch(`/api/staff/${id}/link-code`, { method: 'POST' })
    const data = (await res.json()) as { error?: string; display?: string; expiresAt?: string }
    if (!res.ok || !data.display || !data.expiresAt) {
      setMsg(data.error ?? '連携コードの発行に失敗しました')
      return
    }
    setCodes((prev) => ({ ...prev, [id]: { display: data.display!, expiresAt: data.expiresAt! } }))
    setMsg(null)
  }

  async function create() {
    if (draft.name.trim() === '') return
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, lineUserId: draft.lineUserId.trim() || null }),
    })
    const data = (await res.json()) as { error?: string; staff?: StaffRow }
    if (!res.ok || !data.staff) {
      setMsg(data.error ?? '登録に失敗しました')
      return
    }
    setRows((prev) => [...prev, data.staff as StaffRow])
    setDraft({ name: '', lineUserId: '', role: 'STAFF' })
    router.refresh()
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-bold">担当者</h2>
      <p className="mb-4 text-xs text-slate-500">
        個人LINEへ通知するには、社内通知Botと友だちになったうえで LINEユーザーID を登録してください。未登録の場合は社内共通の通知先へ送られます。
        <br />
        IDは33文字あり書き写すと間違えるため、<strong>「連携コード」を発行して本人に社内通知Botへ送ってもらう</strong>のが確実です。
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2">氏名</th>
              <th>LINEユーザーID</th>
              <th>LINE連携</th>
              <th>役割</th>
              <th>責任者</th>
              <th className="text-center">通知</th>
              <th className="text-center">有効</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-2">
                  <input
                    className="input"
                    defaultValue={r.name}
                    onBlur={(e) => e.target.value !== r.name && patch(r.id, { name: e.target.value })}
                  />
                </td>
                <td className="pr-2">
                  <input
                    className="input font-mono text-xs"
                    defaultValue={r.lineUserId ?? ''}
                    placeholder="U..."
                    onBlur={(e) =>
                      e.target.value !== (r.lineUserId ?? '') && patch(r.id, { lineUserId: e.target.value || null })
                    }
                  />
                </td>
                <td className="pr-2 whitespace-nowrap">
                  {(() => {
                    const issued = codes[r.id]
                    return issued ? (
                      <div>
                        <span className="font-mono text-sm font-bold tracking-widest">{issued.display}</span>
                        <div className="text-[11px] text-slate-500">
                          社内通知Botへ送信（{new Date(issued.expiresAt).toLocaleString('ja-JP')}まで）
                        </div>
                      </div>
                    ) : (
                      <button className="btn-secondary text-xs" onClick={() => issueCode(r.id)}>
                        {r.lineUserId ? 'コード再発行' : '連携コード発行'}
                      </button>
                    )
                  })()}
                </td>
                <td className="pr-2">
                  <select className="input w-28" value={r.role} onChange={(e) => patch(r.id, { role: e.target.value as StaffRow['role'] })}>
                    {ROLES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="pr-2">
                  <select
                    className="input w-36"
                    value={r.managerId ?? ''}
                    onChange={(e) => patch(r.id, { managerId: e.target.value || null })}
                  >
                    <option value="">未設定</option>
                    {rows
                      .filter((o) => o.id !== r.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="text-center">
                  <input type="checkbox" checked={r.notifyEnabled} onChange={(e) => patch(r.id, { notifyEnabled: e.target.checked })} />
                </td>
                <td className="text-center">
                  <input type="checkbox" checked={r.active} onChange={(e) => patch(r.id, { active: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <div>
          <label className="label">氏名</label>
          <input className="input w-40" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label className="label">LINEユーザーID</label>
          <input
            className="input w-56 font-mono text-xs"
            placeholder="U..."
            value={draft.lineUserId}
            onChange={(e) => setDraft({ ...draft, lineUserId: e.target.value })}
          />
        </div>
        <div>
          <label className="label">役割</label>
          <select className="input w-28" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRow['role'] })}>
            {ROLES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={create}>
          担当者を追加
        </button>
        {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
      </div>
    </section>
  )
}
