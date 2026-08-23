'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface HolidayRow {
  id: string
  date: string
  name: string
  isOpen: boolean
}

export function HolidayTable({ initial }: { initial: HolidayRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [draft, setDraft] = useState({ date: '', name: '', isOpen: false })

  async function add() {
    if (!draft.date || !draft.name) return
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (res.ok) {
      const data = (await res.json()) as { holiday: { id: string; date: string; name: string; isOpen: boolean } }
      setRows((prev) =>
        [...prev.filter((r) => r.date !== draft.date), { ...data.holiday, date: draft.date }].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      )
      setDraft({ date: '', name: '', isOpen: false })
      router.refresh()
    }
  }

  async function remove(id: string) {
    await fetch(`/api/holidays/${id}`, { method: 'DELETE' })
    setRows((prev) => prev.filter((r) => r.id !== id))
    router.refresh()
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-bold">祝日・臨時休業日</h2>
      <p className="mb-4 text-xs text-slate-500">
        登録した日は休業日として扱い、リマインドを翌営業日まで繰り延べます。「臨時営業日」にチェックを入れると、曜日設定が休業でもその日は営業扱いになります。
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2">日付</th>
            <th>名称</th>
            <th>区分</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-6 text-center text-slate-500">
                登録がありません
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 tabular-nums">{r.date}</td>
                <td>{r.name}</td>
                <td className="text-xs">{r.isOpen ? '臨時営業日' : '休業日'}</td>
                <td className="text-right">
                  <button className="text-xs text-red-600 hover:underline" onClick={() => remove(r.id)}>
                    削除
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <div>
          <label className="label">日付</label>
          <input className="input w-40" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </div>
        <div>
          <label className="label">名称</label>
          <input className="input w-48" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={draft.isOpen} onChange={(e) => setDraft({ ...draft, isOpen: e.target.checked })} />
          臨時営業日
        </label>
        <button className="btn-primary" onClick={add}>
          追加
        </button>
      </div>
    </section>
  )
}
