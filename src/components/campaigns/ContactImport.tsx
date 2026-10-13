'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const SOURCES = [
  { value: 'LINE_FORM', label: '公式LINE経由のフォーム回答' },
  { value: 'WEB_FORM', label: '自社サイトのフォーム' },
  { value: 'INQUIRY', label: '問い合わせ・来店・電話' },
  { value: 'IMPORT', label: 'その他（経路不明）' },
] as const

interface DryRunResult {
  detected: string[]
  parsed: number
  errorCount: number
  errors: { line: number; reason: string }[]
  sample: { email: string; name: string | null; areas: string[]; budgetMax: number | null; consent: string }[]
}

interface ImportResult {
  created: number
  updated: number
  suppressed: number
  skipped: number
  errorCount: number
  errors: { line: number; reason: string }[]
}

export function ContactImport() {
  const router = useRouter()
  const [csv, setCsv] = useState('')
  const [source, setSource] = useState<(typeof SOURCES)[number]['value']>('LINE_FORM')
  const [consentNote, setConsentNote] = useState('')
  const [treatAsOptedIn, setTreatAsOptedIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dry, setDry] = useState<DryRunResult | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function readFile(file: File) {
    setCsv(await file.text())
    setDry(null)
    setDone(null)
  }

  async function submit(dryRun: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, source, consentNote: consentNote || null, treatAsOptedIn, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '取り込みに失敗しました')
        return
      }
      if (dryRun) {
        setDry(data as DryRunResult)
        setDone(null)
      } else {
        setDone(data as ImportResult)
        setDry(null)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-4 p-4">
      <div>
        <h2 className="text-sm font-bold">リストの取り込み（CSV）</h2>
        <p className="mt-1 text-xs text-slate-500">
          1行目を見出し行として読み取ります。「メールアドレス」「名前」「電話番号」「希望エリア」「予算」「物件種別」
          などの列名に対応しています。メールアドレスの列は必須です。
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700">CSVファイル</label>
        <input
          type="file"
          accept=".csv,.tsv,text/csv,text/plain"
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void readFile(f)
          }}
        />
        <p className="mt-1 text-xs text-slate-500">貼り付けでも構いません（下のテキスト欄）。</p>
      </div>

      <textarea
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value)
          setDry(null)
          setDone(null)
        }}
        rows={6}
        placeholder={'メールアドレス,名前,電話番号,希望エリア,予算\nsample@example.com,山田太郎,090-1234-5678,世田谷区,5000万'}
        className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">取得経路</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">同意の根拠（記録として保存）</label>
          <input
            value={consentNote}
            onChange={(e) => setConsentNote(e.target.value)}
            placeholder="例: Instagram広告→公式LINE→物件希望フォーム（配信同意の記載あり）"
            className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <input
          type="checkbox"
          checked={treatAsOptedIn}
          onChange={(e) => setTreatAsOptedIn(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <strong>このリストは配信同意を得ている</strong>として取り込む（同意列が無い場合に適用）。
          <br />
          フォームに「物件情報をメールでお送りします」等の記載があった場合のみチェックしてください。
          チェックしない場合は「同意不明」として取り込まれ、既定の配信対象には入りません。
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || csv.trim().length === 0}
          onClick={() => void submit(true)}
          className="rounded border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          内容を確認（取り込まない）
        </button>
        <button
          type="button"
          disabled={busy || csv.trim().length === 0}
          onClick={() => void submit(false)}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          取り込む
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {dry ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs">
          <p className="font-bold">
            {dry.parsed}件を読み取りました（エラー {dry.errorCount}件）
          </p>
          <p className="mt-1 text-slate-600">認識した列: {dry.detected.join(', ') || 'なし'}</p>
          {dry.sample.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {dry.sample.map((s) => (
                <li key={s.email} className="text-slate-700">
                  {s.email} / {s.name ?? '(名前なし)'} / {s.areas.join('・') || '-'} /{' '}
                  {s.budgetMax ? `${s.budgetMax.toLocaleString()}万円` : '-'}
                </li>
              ))}
            </ul>
          ) : null}
          {dry.errors.length > 0 ? (
            <ul className="mt-2 space-y-1 text-red-700">
              {dry.errors.map((e) => (
                <li key={e.line}>
                  {e.line}行目: {e.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {done ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          <p className="font-bold">
            新規 {done.created}件 / 更新 {done.updated}件 を取り込みました
          </p>
          {done.suppressed > 0 ? (
            <p className="mt-1">
              うち {done.suppressed}件 は配信停止済みのため、配信対象には入れていません。
            </p>
          ) : null}
          {done.errorCount > 0 ? <p className="mt-1 text-red-700">{done.errorCount}件は取り込めませんでした。</p> : null}
        </div>
      ) : null}
    </div>
  )
}
