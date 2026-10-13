'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface PropertyOption {
  id: string
  title: string
  area: string | null
  price: number | null
}

export interface CampaignDraft {
  id: string | null
  name: string
  subject: string
  body: string
  propertyIds: string[]
  segAreas: string[]
  segBudgetMin: number | null
  segBudgetMax: number | null
  segOptedInOnly: boolean
  segLineSilentOnly: boolean
  segLineSilentDays: number
}

interface PreviewData {
  total: number
  segment: string[]
  mailConfigured: boolean
  renderError: string | null
  preview: { subject: string; text: string } | null
}

export const DEFAULT_BODY = `{{name}}様

いつもお世話になっております。
ご希望の条件に近い物件が入りましたので、ご案内いたします。

{{properties}}

ご興味のある物件がございましたら、このメールにご返信ください。
内見のご案内をさせていただきます。`

export function CampaignEditor({
  initial,
  properties,
  editable,
}: {
  initial: CampaignDraft
  properties: PropertyOption[]
  editable: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)

  function set<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setPreview(null)
  }

  async function save(): Promise<string | null> {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: draft.name,
        subject: draft.subject,
        body: draft.body,
        propertyIds: draft.propertyIds,
        segAreas: draft.segAreas,
        segBudgetMin: draft.segBudgetMin,
        segBudgetMax: draft.segBudgetMax,
        segOptedInOnly: draft.segOptedInOnly,
        segLineSilentOnly: draft.segLineSilentOnly,
        segLineSilentDays: draft.segLineSilentDays,
      }
      const res = await fetch(draft.id ? `/api/campaigns/${draft.id}` : '/api/campaigns', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '保存に失敗しました')
        return null
      }
      const id = (data.campaign?.id as string) ?? draft.id
      if (!draft.id && id) {
        router.replace(`/campaigns/${id}`)
      }
      setMessage('保存しました')
      router.refresh()
      return id
    } finally {
      setBusy(false)
    }
  }

  async function loadPreview() {
    const id = draft.id ?? (await save())
    if (!id) return
    setBusy(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/preview`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '確認に失敗しました')
        return
      }
      setPreview(data as PreviewData)
      setError(null)
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    const id = draft.id ?? (await save())
    if (!id) return
    setBusy(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/test`, { method: 'POST' })
      const data = await res.json()
      setMessage(res.ok ? `テスト送信しました（${data.to}）` : null)
      setError(res.ok ? null : (data.error ?? 'テスト送信に失敗しました'))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (!draft.id || !preview) return
    const ok = window.confirm(
      `${preview.total}件に送信します。\n送信を開始すると取り消せません（途中停止は可能です）。よろしいですか？`,
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await fetch(`/api/campaigns/${draft.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedTotal: preview.total }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '送信の開始に失敗しました')
        return
      }
      setMessage(`${data.total}件をキューに登録しました。順次送信されます。`)
      setError(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const disabled = !editable || busy

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold">配信内容</h2>

        <div>
          <label className="block text-xs font-medium text-slate-700">配信名（社内管理用）</label>
          <input
            value={draft.name}
            disabled={disabled}
            onChange={(e) => set('name', e.target.value)}
            placeholder="例: 世田谷区 新着マンション 8月号"
            className="mt-1 w-full rounded border border-slate-300 p-2 text-sm disabled:bg-slate-50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">件名</label>
          <input
            value={draft.subject}
            disabled={disabled}
            onChange={(e) => set('subject', e.target.value)}
            placeholder="例: {{name}}様へ 世田谷区の新着物件のご案内"
            className="mt-1 w-full rounded border border-slate-300 p-2 text-sm disabled:bg-slate-50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">本文</label>
          <textarea
            value={draft.body}
            disabled={disabled}
            onChange={(e) => set('body', e.target.value)}
            rows={12}
            className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-xs disabled:bg-slate-50"
          />
          <p className="mt-1 text-xs text-slate-500">
            差し込み: <code>{'{{name}}'}</code> お客様の名前 / <code>{'{{properties}}'}</code> 選んだ物件一覧 /{' '}
            <code>{'{{unsubscribe_url}}'}</code> 配信停止リンク
            <br />
            会社名・住所・配信停止リンクは、本文に書かなくても自動で末尾に付きます（法令で表示が義務づけられているため）。
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">掲載する物件</label>
          {properties.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">物件が登録されていません。</p>
          ) : (
            <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
              {properties.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={draft.propertyIds.includes(p.id)}
                    onChange={(e) =>
                      set(
                        'propertyIds',
                        e.target.checked
                          ? [...draft.propertyIds, p.id]
                          : draft.propertyIds.filter((x) => x !== p.id),
                      )
                    }
                  />
                  <span>
                    {p.title}
                    <span className="ml-2 text-xs text-slate-500">
                      {p.area ?? ''} {p.price ? `${p.price.toLocaleString('ja-JP')}万円` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold">配信対象</h2>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={draft.segOptedInOnly}
            onChange={(e) => set('segOptedInOnly', e.target.checked)}
            className="mt-1"
          />
          <span>
            配信同意が確認できている人だけに送る
            <span className="block text-xs text-slate-500">
              外すと「同意不明」の人にも送ります。取得経路を説明できる場合のみ外してください。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={draft.segLineSilentOnly}
            onChange={(e) => set('segLineSilentOnly', e.target.checked)}
            className="mt-1"
          />
          <span>
            公式LINEで反応が無い人だけに送る
            <span className="block text-xs text-slate-500">
              LINEをブロック済み・LINEに居ない・下記の日数こちらへの返信が無い人が対象になります。
              LINE配信と二重に届くのを防げます。
            </span>
          </span>
        </label>

        {draft.segLineSilentOnly ? (
          <div className="pl-6">
            <label className="block text-xs font-medium text-slate-700">反応が無いとみなす日数</label>
            <input
              type="number"
              min={1}
              max={365}
              disabled={disabled}
              value={draft.segLineSilentDays}
              onChange={(e) => set('segLineSilentDays', Number(e.target.value) || 30)}
              className="mt-1 w-24 rounded border border-slate-300 p-2 text-sm disabled:bg-slate-50"
            />
            <span className="ml-2 text-xs text-slate-500">日</span>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">希望エリア（カンマ区切り）</label>
            <input
              value={draft.segAreas.join(',')}
              disabled={disabled}
              onChange={(e) =>
                set(
                  'segAreas',
                  e.target.value
                    .split(',')
                    .map((v) => v.trim())
                    .filter((v) => v.length > 0),
                )
              }
              placeholder="世田谷区,目黒区"
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">価格帯 下限（万円）</label>
            <input
              type="number"
              value={draft.segBudgetMin ?? ''}
              disabled={disabled}
              onChange={(e) => set('segBudgetMin', e.target.value === '' ? null : Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">価格帯 上限（万円）</label>
            <input
              type="number"
              value={draft.segBudgetMax ?? ''}
              disabled={disabled}
              onChange={(e) => set('segBudgetMax', e.target.value === '' ? null : Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm disabled:bg-slate-50"
            />
          </div>
        </div>
      </section>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            下書きを保存
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void sendTest()}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            自分にテスト送信
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadPreview()}
            className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            対象と文面を確認
          </button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {preview ? (
        <section className="card space-y-3 border-2 border-slate-900 p-4">
          <h2 className="text-sm font-bold">送信前の最終確認</h2>

          <p className="text-2xl font-bold">
            {preview.total.toLocaleString('ja-JP')}
            <span className="ml-1 text-sm font-normal text-slate-600">件に送信されます</span>
          </p>
          <ul className="list-inside list-disc text-xs text-slate-600">
            {preview.segment.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>

          {!preview.mailConfigured ? (
            <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              MAIL_PROVIDER が未設定のため、実際にはメールは送信されません（動作確認モード）。
            </p>
          ) : null}
          {preview.renderError ? (
            <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
              設定が不足しています: {preview.renderError}
            </p>
          ) : null}

          {preview.preview ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-700">件名: {preview.preview.subject}</p>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-slate-700">
                {preview.preview.text}
              </pre>
            </div>
          ) : null}

          {editable ? (
            <button
              type="button"
              disabled={busy || preview.total === 0 || preview.renderError !== null}
              onClick={() => void send()}
              className="rounded bg-red-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              この内容で {preview.total.toLocaleString('ja-JP')}件に配信を開始する
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
