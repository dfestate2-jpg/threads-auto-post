'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { Finding } from '@/lib/company-os/advisor'
import { api } from './api'

const SAMPLES = [
  '今日何をやるべき？',
  '今一番重要な課題は？',
  '期限が危ないタスクは？',
  'このプロジェクトは遅れている？',
  '今の会社の状況をまとめて',
  '今の数字を教えて',
]

interface AnswerPayload {
  text: string
  findings: Finding[]
  tasks: { id: string; title: string; reasons: string[]; overdueDays: number }[]
}

interface Turn {
  question: string
  answer: AnswerPayload | null
  error: string | null
}

/**
 * AI経営アシスタント。
 *
 * Phase1 は会社のデータを読み取ったうえでルールが答える。外部には何も送らない。
 * 回答には必ず根拠（該当タスク・検出結果）を添えて、鵜呑みにしなくてよい形にしている。
 */
export function AiAssistant() {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)

  async function ask(text: string) {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setQuestion('')
    const result = await api.post<AnswerPayload>('/ai/ask', { question: value })
    setBusy(false)
    setTurns((prev) => [
      { question: value, answer: result.ok ? (result.data ?? null) : null, error: result.ok ? null : (result.error ?? null) },
      ...prev,
    ])
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="会社のことを聞いてください"
          aria-label="質問"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={busy || question.trim().length === 0}>
          {busy ? '考え中…' : '質問する'}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SAMPLES.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => void ask(sample)}
            disabled={busy}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-slate-400 disabled:opacity-50"
          >
            {sample}
          </button>
        ))}
      </div>

      {turns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-3xl" aria-hidden>
            🤖
          </p>
          <p className="mt-3 text-sm font-medium text-slate-700">会社のデータをもとに答えます</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            タスク・課題・決定事項・プロジェクト・会議・KPI を読み取って回答します。
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {turns.map((turn, index) => (
            <li key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-900">Q. {turn.question}</p>
              {turn.error ? (
                <p className="mt-2 text-sm text-red-600">{turn.error}</p>
              ) : turn.answer ? (
                <>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{turn.answer.text}</p>

                  {turn.answer.tasks.length > 0 ? (
                    <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                      {turn.answer.tasks.map((task) => (
                        <li key={task.id} className="text-xs">
                          <Link href={`/company-os/tasks/${task.id}`} className="text-slate-700 hover:underline">
                            {task.title}
                          </Link>
                          {task.reasons.length > 0 ? (
                            <span className="ml-2 text-slate-400">{task.reasons.join('・')}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
