'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface RuleRow {
  id?: string
  name: string
  thresholdMinutes: number
  notifyAssignee: boolean
  notifyManager: boolean
  notifyAdmins: boolean
  notifyGroup: boolean
  enabled: boolean
}

export function EscalationForm({ initial }: { initial: RuleRow[] }) {
  const router = useRouter()
  const [rules, setRules] = useState<RuleRow[]>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function patch(index: number, p: Partial<RuleRow>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...p } : r)))
  }

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/escalation-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
      const data = (await res.json()) as { error?: string }
      setMsg(res.ok ? '保存しました' : (data.error ?? '保存に失敗しました'))
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-bold">エスカレーション設定</h2>
      <p className="mb-4 text-xs text-slate-500">
        未返信の経過時間に応じて通知先を追加します。到達済みのルールの宛先はすべて合算され、同じ宛先には1通だけ届きます。
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2">ルール名</th>
              <th>経過（分）</th>
              <th className="text-center">担当者</th>
              <th className="text-center">責任者</th>
              <th className="text-center">管理者</th>
              <th className="text-center">共通グループ</th>
              <th className="text-center">有効</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-2">
                  <input className="input" value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />
                </td>
                <td className="pr-2">
                  <input
                    className="input w-24"
                    type="number"
                    min={1}
                    value={r.thresholdMinutes}
                    onChange={(e) => patch(i, { thresholdMinutes: Number(e.target.value) })}
                  />
                </td>
                {(['notifyAssignee', 'notifyManager', 'notifyAdmins', 'notifyGroup', 'enabled'] as const).map((k) => (
                  <td key={k} className="text-center">
                    <input type="checkbox" checked={r[k]} onChange={(e) => patch(i, { [k]: e.target.checked })} />
                  </td>
                ))}
                <td className="text-right">
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => setRules((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn-secondary"
          onClick={() =>
            setRules((prev) => [
              ...prev,
              {
                name: '新しいルール',
                thresholdMinutes: 60,
                notifyAssignee: true,
                notifyManager: false,
                notifyAdmins: false,
                notifyGroup: false,
                enabled: true,
              },
            ])
          }
        >
          ルールを追加
        </button>
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? '保存中…' : 'エスカレーション設定を保存'}
        </button>
        {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
      </div>
    </section>
  )
}
