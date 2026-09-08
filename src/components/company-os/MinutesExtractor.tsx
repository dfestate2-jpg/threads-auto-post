'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { EXTRACT_KIND_LABEL, type ExtractedItem, type ExtractedKind } from '@/lib/company-os/minutes'
import { api } from './api'
import { Modal } from './RecordDialog'

interface Row extends ExtractedItem {
  include: boolean
}

const KINDS: ExtractedKind[] = ['decision', 'task', 'issue', 'question']

/**
 * 議事録から決定事項・タスク・課題・未決事項を取り出して登録する。
 *
 * 抽出結果をそのまま保存はしない。必ず一覧で見せて、種類の付け替えと
 * 取捨選択をしてもらってから登録する。誤読を黙って台帳に残さないため。
 */
export function MinutesExtractor({ meetingId, hasMinutes }: { meetingId: string; hasMinutes: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [skipped, setSkipped] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/company-os/meetings/${meetingId}/extract`)
      const payload = (await response.json()) as { data?: { items: ExtractedItem[]; skipped: number }; error?: string }
      if (!response.ok) {
        setError(payload.error ?? '読み取りに失敗しました')
        return
      }
      setRows((payload.data?.items ?? []).map((item) => ({ ...item, include: true })))
      setSkipped(payload.data?.skipped ?? 0)
    } catch {
      setError('通信に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    const items = rows.filter((r) => r.include)
    if (items.length === 0 || saving) return
    setSaving(true)
    setError(null)
    const result = await api.post(`/meetings/${meetingId}/extract`, {
      items: items.map((r) => ({ kind: r.kind, text: r.text, assignee: r.assignee, due: r.due })),
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? '登録に失敗しました')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void load()}
        disabled={!hasMinutes}
        className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
        title={hasMinutes ? undefined : '議事録を入力すると使えます'}
      >
        🤖 議事録から仕分ける
      </button>

      {open ? (
        <Modal title="議事録から仕分ける" onClose={() => setOpen(false)} wide>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">読み取っています…</p>
          ) : rows.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-600">仕分けられる行が見つかりませんでした。</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                「## 決定事項」「## タスク」「## 課題」「## 未決事項」の見出しを付けるか、
                行の先頭に「決定：」「タスク：」と書くと拾えます。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {rows.length}件を検出しました{skipped > 0 ? `（${skipped}行は種類が判別できず対象外）` : ''}。
                登録するものを選び、種類が違うものは直してください。
              </p>

              <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
                {rows.map((row, index) => (
                  <li key={index} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) =>
                        setRows((prev) => prev.map((r, i) => (i === index ? { ...r, include: e.target.checked } : r)))
                      }
                      className="mt-1.5 h-4 w-4 rounded border-slate-300"
                      aria-label={`${row.text}を登録する`}
                    />
                    <select
                      value={row.kind}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, kind: e.target.value as ExtractedKind } : r)),
                        )
                      }
                      aria-label="種類"
                      className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    >
                      {KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {EXTRACT_KIND_LABEL[kind]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={row.text}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, text: e.target.value } : r)))}
                      aria-label="内容"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                    {row.assignee ? (
                      <span className="shrink-0 whitespace-nowrap rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        👤 {row.assignee}
                      </span>
                    ) : null}
                    {row.due ? (
                      <span className="shrink-0 whitespace-nowrap rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        {row.due}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              <p className="text-xs text-slate-400">
                担当者は、同じ名前のメンバーが登録されている場合だけ自動で割り当てます。
              </p>
            </div>
          )}

          {error ? (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-2 text-sm">
              閉じる
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="btn-primary px-4 py-2 text-sm"
              disabled={saving || rows.filter((r) => r.include).length === 0}
            >
              {saving ? '登録中…' : `${rows.filter((r) => r.include).length}件を登録する`}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
