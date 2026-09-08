'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { api } from './api'
import { Modal } from './RecordDialog'

/**
 * 未決事項を「決まった」ことにする。
 *
 * 決めた瞬間に意思決定として記録し、未決事項からリンクを張る。
 * 二か所に手で書かせると、片方だけ直されて食い違う。
 */
export function ResolveQuestionButton({
  questionId,
  questionTitle,
  recommendation,
  members,
  defaultDecider,
}: {
  questionId: string
  questionTitle: string
  recommendation: string | null
  members: { value: string; label: string }[]
  defaultDecider: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(recommendation ?? questionTitle)
  const [reason, setReason] = useState('')
  const [decidedOn, setDecidedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [deciderId, setDeciderId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await api.post(`/questions/${questionId}/resolve`, {
      title: title.trim(),
      reason: reason.trim() || null,
      decidedOn,
      deciderId: deciderId || null,
      deciderName: deciderId ? null : defaultDecider,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? '登録に失敗しました')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary px-3 py-1.5 text-xs">
        決まった
      </button>
      {open ? (
        <Modal title="決定として記録する" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              意思決定として記録し、この未決事項を「決定済み」にします。
              未決事項の論点は、決定の「背景」として引き継がれます。
            </p>
            <div>
              <label htmlFor="rq-title" className="mb-1 block text-xs font-medium text-slate-600">
                決定内容 <span className="text-red-500">*</span>
              </label>
              <input id="rq-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label htmlFor="rq-reason" className="mb-1 block text-xs font-medium text-slate-600">
                そう決めた理由
              </label>
              <textarea id="rq-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="rq-date" className="mb-1 block text-xs font-medium text-slate-600">
                  決定日 <span className="text-red-500">*</span>
                </label>
                <input
                  id="rq-date"
                  type="date"
                  value={decidedOn}
                  onChange={(e) => setDecidedOn(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="rq-decider" className="mb-1 block text-xs font-medium text-slate-600">
                  決定者
                </label>
                <select id="rq-decider" value={deciderId} onChange={(e) => setDeciderId(e.target.value)} className={inputClass}>
                  <option value="">{defaultDecider}（自分）</option>
                  {members.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-2 text-sm">
                キャンセル
              </button>
              <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={busy || title.trim().length === 0}>
                {busy ? '登録中…' : '決定として記録する'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
