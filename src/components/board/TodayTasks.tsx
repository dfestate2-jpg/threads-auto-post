'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface TaskRow {
  id: string
  title: string
  dueOn: string
  done: boolean
  /** 期限を過ぎた日数。0 なら今日ぶん */
  overdue: number
  assigneeName: string | null
}

/**
 * 顧客と関係のない、自分のやること。
 *
 * 追客だけを並べていると、それ以外（役所へ電話する・鍵を返す・書類を出す）は
 * 別の場所で管理することになり、**見る場所が2つに割れる。**
 * 割れた時点で片方は必ず見られなくなるので、同じ画面に置く。
 *
 * 追客と混ぜずに区切ってあるのは、性質が違うため。追客はシステムが日付を決めるが、
 * こちらは人が決める。同じ見た目にすると、どちらの都合で出ているのか分からなくなる。
 */
export function TodayTasks({ tasks, today }: { tasks: TaskRow[]; today: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueOn, setDueOn] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function add(): Promise<void> {
    const text = title.trim()
    if (text === '') return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/board/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text, dueOn }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? '追加できませんでした')
        return
      }
      setTitle('')
      setDueOn(today)
      setOpen(false)
      router.refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(id: string, done: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/board/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })
      if (!res.ok) {
        setError('更新できませんでした')
        return
      }
      router.refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, label: string): Promise<void> {
    // 済みにするのと違い、消すと記録も残らない。取り違えると戻せないので確認する
    if (!confirm(`「${label}」を消しますか？`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/board/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setError('消せませんでした')
        return
      }
      router.refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const remaining = tasks.filter((t) => !t.done).length

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">
          今日のタスク
          {remaining > 0 ? <span className="ml-2 text-sm font-normal text-slate-500">{remaining}件</span> : null}
        </h2>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '閉じる' : '＋ 追加'}
        </button>
      </div>

      {open ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="例）鍵を管理会社に返す"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              aria-label="いつやるか"
            />
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy || title.trim() === ''}
              onClick={() => void add()}
            >
              追加する
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">今日のタスクはありません。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {tasks.map((t) => (
            <li
              key={t.id}
              className={`flex items-start gap-2 rounded-lg px-2 py-2 ${t.overdue > 0 && !t.done ? 'bg-red-50' : ''}`}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 flex-none"
                checked={t.done}
                disabled={busy}
                aria-label={`${t.title} を済みにする`}
                onChange={(e) => void toggle(t.id, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${t.done ? 'text-slate-400 line-through' : ''}`}>{t.title}</span>
                <span className="block text-xs text-slate-500">
                  {t.overdue > 0 && !t.done ? (
                    <span className="font-bold text-red-700">{t.overdue}日過ぎています（{t.dueOn}）</span>
                  ) : (
                    t.dueOn
                  )}
                  {t.assigneeName ? <span className="ml-2">{t.assigneeName}</span> : null}
                </span>
              </span>
              <button
                type="button"
                className="flex-none text-xs text-slate-400 underline"
                disabled={busy}
                onClick={() => void remove(t.id, t.title)}
              >
                消す
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
