'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PROJECT_TEMPLATES } from '@/lib/company-os/templates'
import { api } from './api'

/**
 * テンプレートからプロジェクト一式を作るボタン。
 *
 * 何件作られるのかを押す前に見せる。数十件が黙って増えると、
 * 「勝手に増えた」と受け取られてアプリごと信用されなくなる。
 */
export function TemplateButtons() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function apply(key: string, name: string, count: number) {
    if (busy) return
    if (!window.confirm(`「${name}」のタスク${count}件を作成します。よろしいですか？\n（すでに作成済みのタスクは重複しません）`)) return

    setBusy(key)
    setError(null)
    setMessage(null)
    const result = await api.post<{ createdTasks: number; skippedTasks: number; projectName: string }>(
      '/templates/apply',
      { templateKey: key },
    )
    setBusy(null)
    if (!result.ok) {
      setError(result.error ?? '作成に失敗しました')
      return
    }
    const data = result.data
    setMessage(
      data
        ? `「${data.projectName}」に${data.createdTasks}件を追加しました${data.skippedTasks > 0 ? `（${data.skippedTasks}件は作成済みのため据え置き）` : ''}`
        : '作成しました',
    )
    router.refresh()
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {PROJECT_TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => void apply(template.key, template.name, template.tasks.length)}
            disabled={busy !== null}
            className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
            title={template.description}
          >
            {busy === template.key ? '作成中…' : `${template.icon} ${template.name}テンプレート（${template.tasks.length}件）`}
          </button>
        ))}
      </div>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
