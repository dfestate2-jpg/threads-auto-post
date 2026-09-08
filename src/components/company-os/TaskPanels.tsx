'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { api } from './api'

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

/**
 * チェックリスト。
 * タスクを分解しないと「進んでいるのに終わらない」状態が見えない。
 */
export function ChecklistPanel({ taskId, items }: { taskId: string; items: ChecklistItem[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const done = items.filter((i) => i.done).length

  async function add(event: React.FormEvent) {
    event.preventDefault()
    const value = label.trim()
    if (!value || busy) return
    setBusy(true)
    const result = await api.post(`/tasks/${taskId}/checklist`, { label: value })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? '追加に失敗しました')
      return
    }
    setLabel('')
    setError(null)
    router.refresh()
  }

  async function toggle(id: string, next: boolean) {
    const result = await api.patch(`/checklist-items/${id}`, { done: next })
    if (result.ok) router.refresh()
  }

  async function remove(id: string) {
    const result = await api.del(`/checklist-items/${id}`)
    if (result.ok) router.refresh()
  }

  return (
    <div>
      {items.length > 0 ? (
        <p className="mb-2 text-xs text-slate-500">
          {done}/{items.length} 完了
        </p>
      ) : null}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => void toggle(item.id, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
              aria-label={item.label}
            />
            <span className={`flex-1 text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
              {item.label}
            </span>
            <button
              type="button"
              onClick={() => void remove(item.id)}
              className="text-xs text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
              aria-label={`${item.label}を削除`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-2 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="チェック項目を追加"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button type="submit" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy || label.trim().length === 0}>
          追加
        </button>
      </form>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

export interface CommentRow {
  id: string
  authorName: string
  body: string
  createdAt: string
}

/** コメント。決めた経緯を、タスクの横に残せるようにする */
export function CommentPanel({ target, comments }: { target: { taskId?: string; issueId?: string }; comments: CommentRow[] }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = body.trim()
    if (!value || busy) return
    setBusy(true)
    const result = await api.post('/comments', { ...target, body: value })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? '投稿に失敗しました')
      return
    }
    setBody('')
    setError(null)
    router.refresh()
  }

  return (
    <div>
      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">{comment.authorName}</span>
              <span className="text-[11px] text-slate-400">{comment.createdAt}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{comment.body}</p>
          </li>
        ))}
        {comments.length === 0 ? <li className="text-sm text-slate-400">まだコメントはありません。</li> : null}
      </ul>

      <form onSubmit={submit} className="mt-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="経緯や気づいたことを残す"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
          <button type="submit" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy || body.trim().length === 0}>
            {busy ? '投稿中…' : 'コメントする'}
          </button>
        </div>
      </form>
    </div>
  )
}

export interface DependencyRow {
  id: string
  title: string
  status: string
  statusLabel: string
}

/**
 * 依存関係。
 * 「これが終わらないと始められない」を明示すると、着手できないタスクを
 * 今日のリストから外せる。循環はサーバー側で断る。
 */
export function DependencyPanel({
  taskId,
  dependencies,
  dependents,
  candidates,
}: {
  taskId: string
  dependencies: DependencyRow[]
  dependents: DependencyRow[]
  candidates: { value: string; label: string }[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || busy) return
    setBusy(true)
    const result = await api.post(`/tasks/${taskId}/dependencies`, { dependsOnId: selected })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? '追加に失敗しました')
      return
    }
    setSelected('')
    setError(null)
    router.refresh()
  }

  async function remove(dependsOnId: string) {
    const result = await api.del(`/tasks/${taskId}/dependencies`, { dependsOnId })
    if (result.ok) router.refresh()
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">このタスクが待っている先行タスク</p>
        {dependencies.length === 0 ? (
          <p className="text-sm text-slate-400">ありません（すぐ着手できます）</p>
        ) : (
          <ul className="space-y-1">
            {dependencies.map((dep) => (
              <li key={dep.id} className="flex items-center gap-2">
                <span className="text-xs" aria-hidden>
                  {dep.status === 'DONE' ? '✅' : '⏳'}
                </span>
                <Link href={`/company-os/tasks/${dep.id}`} className="flex-1 truncate text-sm text-slate-700 hover:underline">
                  {dep.title}
                </Link>
                <span className="text-xs text-slate-400">{dep.statusLabel}</span>
                <button
                  type="button"
                  onClick={() => void remove(dep.id)}
                  className="text-xs text-slate-300 hover:text-red-600"
                  aria-label={`${dep.title}との依存を外す`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="mt-2 flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="先行タスクを選ぶ"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="">先行タスクを選ぶ…</option>
            {candidates.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy || !selected}>
            追加
          </button>
        </form>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">このタスクの完了を待っている後続タスク</p>
        {dependents.length === 0 ? (
          <p className="text-sm text-slate-400">ありません</p>
        ) : (
          <ul className="space-y-1">
            {dependents.map((dep) => (
              <li key={dep.id} className="flex items-center gap-2">
                <Link href={`/company-os/tasks/${dep.id}`} className="flex-1 truncate text-sm text-slate-700 hover:underline">
                  {dep.title}
                </Link>
                <span className="text-xs text-slate-400">{dep.statusLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
