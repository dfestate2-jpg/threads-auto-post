'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { api } from './api'
import { RecordForm } from './RecordForm'
import type { FieldSpec } from './fields'

/**
 * 「＋追加」「編集」ボタンと、その中身のフォーム。
 *
 * 別ページに飛ばすと、一覧を見ながら足すことができない。
 * 画面を離れずに登録できることを優先して、ダイアログにしている。
 */
export function RecordDialog({
  label,
  title,
  fields,
  resource,
  record,
  extraPayload,
  variant = 'primary',
  className = '',
}: {
  label: string
  title: string
  fields: FieldSpec[]
  resource: string
  record?: (Record<string, unknown> & { id?: string }) | null
  extraPayload?: Record<string, unknown>
  variant?: 'primary' | 'secondary' | 'link'
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const buttonClass =
    variant === 'primary'
      ? 'btn-primary px-3 py-1.5 text-xs'
      : variant === 'secondary'
        ? 'btn-secondary px-3 py-1.5 text-xs'
        : 'text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass} ${className}`}>
        {label}
      </button>
      {open ? (
        <Modal title={title} onClose={() => setOpen(false)}>
          <RecordForm
            fields={fields}
            resource={resource}
            record={record}
            extraPayload={extraPayload}
            onDone={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </Modal>
      ) : null}
    </>
  )
}

/** 画面の上に重ねる枠。Esc で閉じられないと、キーボードだけの人が閉じられない */
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-2xl bg-white shadow-xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/** 削除。押し間違いが起きるので必ず一度確認する */
export function DeleteButton({
  resource,
  id,
  label = '削除',
  confirmText = 'この項目を削除します。よろしいですか？',
}: {
  resource: string
  id: string
  label?: string
  confirmText?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (busy) return
    if (!window.confirm(confirmText)) return
    setBusy(true)
    const result = await api.remove(resource, id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? '削除に失敗しました')
      return
    }
    router.refresh()
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-50"
      >
        {busy ? '削除中…' : label}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  )
}
