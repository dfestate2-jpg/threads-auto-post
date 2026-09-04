'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  ACCENTS,
  ACCENT_KEYS,
  DEFAULT_ACCENT,
  DEFAULT_ICON,
  ICON_SUGGESTIONS,
  ROLE_LABEL,
  accentOf,
  displayHost,
  moveInOrder,
  type PortalRole,
} from '@/lib/domain/portal'

export interface SystemRow {
  id: string
  name: string
  icon: string
  accent: string
  description: string | null
  url: string
  openInNewTab: boolean
  published: boolean
  minRole: PortalRole
}

type Draft = Omit<SystemRow, 'id'>

const EMPTY: Draft = {
  name: '',
  icon: DEFAULT_ICON,
  accent: DEFAULT_ACCENT,
  description: '',
  url: '',
  openInNewTab: true,
  published: true,
  minRole: 'STAFF',
}

/**
 * システムの追加・編集・削除・並び替え。
 *
 * ここが「コードを触らずにシステムを増やせる」という要件そのものなので、
 * 新規追加と編集は同じフォーム（同じ検証）を通す。
 * 片方だけ項目が増える、といったズレを作らないため。
 */
export function SystemAdminTable({ initial }: { initial: SystemRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function startNew() {
    setError(null)
    setDraft(EMPTY)
    setEditing('new')
  }

  function startEdit(row: SystemRow) {
    setError(null)
    const { id: _id, ...rest } = row
    setDraft({ ...rest, description: rest.description ?? '' })
    setEditing(row.id)
  }

  function cancel() {
    setEditing(null)
    setError(null)
  }

  async function send(url: string, init: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, body }
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const payload = { ...draft, description: draft.description?.trim() || null }
      const { ok, body } =
        editing === 'new'
          ? await send('/api/portal/systems', { method: 'POST', body: JSON.stringify(payload) })
          : await send(`/api/portal/systems/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) })

      if (!ok) {
        setError((body.error as string) ?? '保存に失敗しました')
        return
      }
      const saved = body.system as SystemRow
      setRows((prev) => (editing === 'new' ? [...prev, saved] : prev.map((r) => (r.id === saved.id ? saved : r))))
      setEditing(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function togglePublished(row: SystemRow) {
    const next = !row.published
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, published: next } : r)))
    const { ok } = await send(`/api/portal/systems/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ published: next }),
    })
    if (!ok) setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, published: row.published } : r)))
    router.refresh()
  }

  async function remove(row: SystemRow) {
    if (!confirm(`「${row.name}」を削除します。よろしいですか？\n（一旦隠したいだけなら「非公開」をお使いください）`)) return
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    await send(`/api/portal/systems/${row.id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function move(index: number, direction: 'up' | 'down') {
    const next = moveInOrder(rows, index, direction)
    if (next === rows) return
    setRows(next)
    await send('/api/portal/systems/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids: next.map((r) => r.id) }),
    })
    router.refresh()
  }

  async function addDefaults() {
    setBusy(true)
    try {
      const { ok, body } = await send('/api/portal/systems/defaults', { method: 'POST' })
      if (ok) setRows(body.systems as SystemRow[])
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          登録したシステムはトップページにカードとして並びます。URLを変えると、次に開いたときから新しい遷移先になります。
        </p>
        <button className="btn-primary shrink-0" onClick={startNew} disabled={editing === 'new'}>
          ＋ システムを追加
        </button>
      </div>

      {editing === 'new' ? (
        <SystemForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} busy={busy} error={error} title="システムを追加" />
      ) : null}

      {rows.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-sm text-slate-600">まだ1件も登録されていません。</p>
          <button className="btn-secondary mt-4" onClick={addDefaults} disabled={busy}>
            初期カードを入れる（リマインドシステム）
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) =>
            editing === row.id ? (
              <li key={row.id}>
                <SystemForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} busy={busy} error={error} title="システムを編集" />
              </li>
            ) : (
              <li key={row.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${accentOf(row.accent).tile}`}
                    aria-hidden
                  >
                    {row.icon}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{row.name}</span>
                      {row.published ? (
                        <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                          公開中
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          非公開
                        </span>
                      )}
                      {row.minRole !== 'STAFF' ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          {ROLE_LABEL[row.minRole]}
                        </span>
                      ) : null}
                    </div>
                    {row.description ? <p className="mt-0.5 text-sm text-slate-500">{row.description}</p> : null}
                    <p className="mt-1 break-all text-xs text-slate-400">
                      {row.url}
                      <span className="ml-1">（{displayHost(row.url)}）</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex gap-1">
                      <IconButton label="上へ" onClick={() => move(i, 'up')} disabled={i === 0}>
                        ↑
                      </IconButton>
                      <IconButton label="下へ" onClick={() => move(i, 'down')} disabled={i === rows.length - 1}>
                        ↓
                      </IconButton>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => startEdit(row)}>
                    編集
                  </button>
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => togglePublished(row)}>
                    {row.published ? '非公開にする' : '公開する'}
                  </button>
                  <button className="btn px-3 py-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => remove(row)}>
                    削除
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function SystemForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  error,
  title,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  error: string | null
  title: string
}) {
  return (
    <section className="card border-slate-400 p-4">
      <h3 className="mb-4 text-sm font-bold">{title}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">システム名</label>
          <input
            className="input"
            value={draft.name}
            maxLength={40}
            placeholder="例：リマインドシステム"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">URL</label>
          <input
            className="input"
            value={draft.url}
            placeholder="https://example.com/remind"
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">
            このサイト内のページなら <code>/customers</code> のように / から書けます。
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="label">説明</label>
          <input
            className="input"
            value={draft.description ?? ''}
            maxLength={120}
            placeholder="例：顧客への連絡予定を管理"
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>

        <div>
          <label className="label">アイコン</label>
          <div className="flex items-center gap-2">
            <input
              className="input w-20 text-center text-xl"
              value={draft.icon}
              maxLength={8}
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            />
            <div className="flex flex-wrap gap-1">
              {ICON_SUGGESTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setDraft({ ...draft, icon: emoji })}
                  className={`h-8 w-8 rounded-lg border text-base transition hover:bg-slate-50 ${
                    draft.icon === emoji ? 'border-slate-900 bg-slate-100' : 'border-slate-200'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="label">カードの色</label>
          <div className="flex flex-wrap gap-1.5">
            {ACCENT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                title={ACCENTS[key].label}
                aria-label={ACCENTS[key].label}
                onClick={() => setDraft({ ...draft, accent: key })}
                className={`h-8 w-8 rounded-lg border-2 transition ${
                  draft.accent === key ? 'border-slate-900' : 'border-transparent'
                }`}
              >
                <span className={`block h-full w-full rounded-md ${ACCENTS[key].tile}`} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">表示できる人</label>
          <select
            className="input"
            value={draft.minRole}
            onChange={(e) => setDraft({ ...draft, minRole: e.target.value as PortalRole })}
          >
            {(Object.keys(ROLE_LABEL) as PortalRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.openInNewTab}
              onChange={(e) => setDraft({ ...draft, openInNewTab: e.target.checked })}
            />
            別のタブで開く
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
            />
            トップページに表示する
          </label>
        </div>
      </div>

      {error ? <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
        <button className="btn-primary" onClick={onSave} disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
      </div>
    </section>
  )
}
