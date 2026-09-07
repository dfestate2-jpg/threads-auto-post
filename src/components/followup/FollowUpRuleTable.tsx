'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ACTION_TYPE_LABEL, CUSTOMER_STATUS_LABEL, CUSTOMER_STATUS_ORDER } from '@/lib/domain/followUp'
import type { ActionType, CustomerStatus } from '@prisma/client'

export interface RuleRow {
  id: string
  status: CustomerStatus
  step: number
  offsetMinutes: number
  actionType: ActionType
  label: string
  notifyStaff: boolean
  transitionTo: CustomerStatus | null
  enabled: boolean
}

/** 分数を「3日」「12時間」のような読みやすい表現にする */
function offsetLabel(minutes: number): string {
  if (minutes === 0) return 'すぐ'
  if (minutes % 1440 === 0) return `${minutes / 1440}日後`
  if (minutes % 60 === 0) return `${minutes / 60}時間後`
  return `${minutes}分後`
}

/**
 * 自動追客ルールの一覧と調整。【指示書 10】
 *
 * 「何日後に何をするか」は会社の営業スタイルで変わるため、画面から変えられるようにする。
 * ここを変えると、以降に計算される次回アクションへ反映される。
 */
export function FollowUpRuleTable({ rules }: { rules: RuleRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    try {
      await fetch(`/api/followup-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {CUSTOMER_STATUS_ORDER.map((status) => {
        const group = rules.filter((r) => r.status === status).sort((a, b) => a.step - b.step)
        if (group.length === 0) return null
        return (
          <section key={status} className="card overflow-x-auto p-4">
            <h3 className="mb-3 text-sm font-bold">{CUSTOMER_STATUS_LABEL[status]}</h3>
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2">順番</th>
                  <th>タイミング</th>
                  <th>やること</th>
                  <th>内容</th>
                  <th>営業へ通知</th>
                  <th>有効</th>
                </tr>
              </thead>
              <tbody>
                {group.map((rule) => (
                  <tr key={rule.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 tabular-nums text-slate-500">{rule.step + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input
                          className="input w-28 py-1 text-xs"
                          defaultValue={rule.offsetMinutes}
                          onChange={(e) => setDraft((d) => ({ ...d, [rule.id]: e.target.value }))}
                          onBlur={() => {
                            const value = Number(draft[rule.id])
                            if (!value || value === rule.offsetMinutes) return
                            void patch(rule.id, { offsetMinutes: value })
                          }}
                          inputMode="numeric"
                        />
                        <span className="whitespace-nowrap text-xs text-slate-500">分（{offsetLabel(rule.offsetMinutes)}）</span>
                      </div>
                    </td>
                    <td className="text-xs">
                      {ACTION_TYPE_LABEL[rule.actionType]}
                      {rule.transitionTo ? (
                        <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                          → {CUSTOMER_STATUS_LABEL[rule.transitionTo]}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-xs text-slate-700">{rule.label}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={rule.notifyStaff}
                        disabled={busy === rule.id}
                        onChange={(e) => patch(rule.id, { notifyStaff: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={busy === rule.id}
                        onChange={(e) => patch(rule.id, { enabled: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
