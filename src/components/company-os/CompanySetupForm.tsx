'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { api } from './api'

const STAGES = [
  { value: 'IDEA', label: '構想中（まだ設立していない）' },
  { value: 'PREPARING', label: '設立準備中' },
  { value: 'ESTABLISHED', label: '設立済み' },
  { value: 'GROWING', label: '成長期' },
  { value: 'ACQUIRED', label: '買収した会社' },
]

/**
 * 最初の会社を作る画面。
 *
 * ここで入力を増やすと、使い始める前に手が止まる。
 * 必須は会社名だけにして、残りは後から会社情報の画面で足せるようにしている。
 * 作成と同時に立ち上げテンプレートを入れるかどうかを選べるのは、
 * 「空のタスク一覧を渡されても何をすればいいか分からない」を避けるため。
 */
export function CompanySetupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [stage, setStage] = useState('IDEA')
  const [industry, setIndustry] = useState('')
  const [vision, setVision] = useState('')
  const [withTemplate, setWithTemplate] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)

    setProgress('会社を登録しています…')
    const created = await api.create<{ id: string }>('companies', { name, stage, industry, vision })
    if (!created.ok) {
      setSaving(false)
      setProgress(null)
      setError(created.error ?? '登録に失敗しました')
      return
    }

    if (withTemplate) {
      setProgress('立ち上げタスクを作成しています…')
      const applied = await api.post('/templates/apply', { templateKey: 'startup' })
      if (!applied.ok) {
        // 会社そのものは作れているので、ここで止めずに知らせるだけにする
        setSaving(false)
        setProgress(null)
        setError(`会社は登録できましたが、テンプレートの作成に失敗しました：${applied.error ?? ''}`)
        router.refresh()
        return
      }
    }

    router.push('/company-os')
    router.refresh()
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500'

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="co-name" className="mb-1 block text-xs font-medium text-slate-600">
          会社名 <span className="text-red-500">*</span>
        </label>
        <input
          id="co-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="まだ決まっていなければ仮の名前で構いません"
          className={inputClass}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="co-stage" className="mb-1 block text-xs font-medium text-slate-600">
            いまの段階
          </label>
          <select id="co-stage" value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="co-industry" className="mb-1 block text-xs font-medium text-slate-600">
            業種
          </label>
          <input
            id="co-industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="不動産、SaaS など"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="co-vision" className="mb-1 block text-xs font-medium text-slate-600">
          何のための会社か
        </label>
        <input
          id="co-vision"
          value={vision}
          onChange={(e) => setVision(e.target.value)}
          placeholder="ダッシュボードの一番上に表示されます"
          className={inputClass}
        />
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <input
          type="checkbox"
          checked={withTemplate}
          onChange={(e) => setWithTemplate(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">
          会社立ち上げテンプレートを作成する
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
            会社設計・法務・経営・営業・開発・補助金・顧客のタスクを、順番と期限つきで一括作成します。
            不要なタスクは後から消せます。
          </span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {progress ? <span className="text-xs text-slate-500">{progress}</span> : null}
        <button type="submit" className="btn-primary px-5 py-2 text-sm" disabled={saving || name.trim().length === 0}>
          {saving ? '作成中…' : '会社を登録する'}
        </button>
      </div>
    </form>
  )
}
