'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { CUSTOMER_STATUS_LABEL } from '@/lib/domain/followUp'
import { TEMPLATE_PLACEHOLDERS } from '@/lib/domain/messageTemplate'
import type { CustomerStatus } from '@prisma/client'

export interface TemplateRow {
  id: string
  key: string
  title: string
  body: string
  status: CustomerStatus | null
  enabled: boolean
}

/** LINEテンプレートの編集。【指示書 9 / MVP 12】 */
export function TemplateTable({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(id: string) {
    setBusy(true)
    try {
      await fetch(`/api/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      setEditing(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        差し込みできる変数：{TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(' / ')}
      </p>
      {templates.map((t) => (
        <section key={t.id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">{t.title}</h3>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                {t.status ? CUSTOMER_STATUS_LABEL[t.status] : 'すべての状況'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary px-3 py-1 text-xs"
                onClick={() => {
                  setEditing(editing === t.id ? null : t.id)
                  setBody(t.body)
                  setTitle(t.title)
                }}
              >
                {editing === t.id ? '閉じる' : '編集'}
              </button>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={t.enabled}
                  disabled={busy}
                  onChange={async (e) => {
                    setBusy(true)
                    await fetch(`/api/templates/${t.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: e.target.checked }),
                    })
                    setBusy(false)
                    router.refresh()
                  }}
                />
                使用する
              </label>
            </div>
          </div>
          {editing === t.id ? (
            <div className="mt-3 space-y-2">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="input h-40 resize-y" value={body} onChange={(e) => setBody(e.target.value)} />
              <button className="btn-primary text-sm" disabled={busy} onClick={() => save(t.id)}>
                保存
              </button>
            </div>
          ) : (
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">{t.body}</pre>
          )}
        </section>
      ))}
    </div>
  )
}
