'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { CUSTOMER_STATUS_LABEL, CUSTOMER_STATUS_ORDER, PRIORITY_LABEL } from '@/lib/domain/followUp'
import type { CustomerStatus, FollowUpPriority } from '@prisma/client'

export interface EditableCustomer {
  id: string
  name: string
  phone: string
  email: string
  assigneeId: string
  inquirySource: string
  desiredArea: string
  desiredRent: string
  moveInTiming: string
  /** yyyy-MM-dd */
  moveInBy: string
  requirements: string
  note: string
  status: CustomerStatus
  priorityOverride: FollowUpPriority | ''
  autoFollowEnabled: boolean
}

/**
 * 顧客情報の編集。【指示書 5】
 *
 * 項目は「分かったときに足す」もので、埋めることを強制しない。
 * ステータスは基本的に自動で動くが、実態とずれたときのために手動変更も残してある。
 */
export function CustomerInfoPanel({
  customer,
  staff,
}: {
  customer: EditableCustomer
  staff: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [form, setForm] = useState(customer)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const set = <K extends keyof EditableCustomer>(key: K, value: EditableCustomer[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function save(patch: Record<string, unknown>, okText: string) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? '保存に失敗しました' })
        return
      }
      setMessage({ type: 'ok', text: okText })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold">顧客情報</h2>

      <div className="space-y-3">
        <div>
          <label className="label">顧客名</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">電話番号</label>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
          </div>
          <div>
            <label className="label">メール</label>
            <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} inputMode="email" />
          </div>
        </div>
        <div>
          <label className="label">担当営業</label>
          <select className="input" value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
            <option value="">未設定</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">問い合わせ経路</label>
            <input className="input" value={form.inquirySource} onChange={(e) => set('inquirySource', e.target.value)} />
          </div>
          <div>
            <label className="label">希望家賃（円）</label>
            <input className="input" value={form.desiredRent} onChange={(e) => set('desiredRent', e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div>
          <label className="label">希望エリア</label>
          <input className="input" value={form.desiredArea} onChange={(e) => set('desiredArea', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">引越し希望時期</label>
            <input className="input" value={form.moveInTiming} onChange={(e) => set('moveInTiming', e.target.value)} />
          </div>
          <div>
            <label className="label">引越し希望日</label>
            <input className="input" type="date" value={form.moveInBy} onChange={(e) => set('moveInBy', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">希望条件</label>
          <textarea className="input h-20 resize-y" value={form.requirements} onChange={(e) => set('requirements', e.target.value)} />
        </div>
        <div>
          <label className="label">営業メモ</label>
          <textarea className="input h-24 resize-y" value={form.note} onChange={(e) => set('note', e.target.value)} />
        </div>

        <button
          className="btn-primary w-full"
          disabled={busy}
          onClick={() =>
            save(
              {
                name: form.name.trim() || null,
                phone: form.phone.trim() || null,
                email: form.email.trim() || null,
                assigneeId: form.assigneeId || null,
                inquirySource: form.inquirySource.trim() || null,
                desiredArea: form.desiredArea.trim() || null,
                desiredRent: form.desiredRent ? Number(form.desiredRent) : null,
                moveInTiming: form.moveInTiming.trim() || null,
                moveInBy: form.moveInBy ? new Date(`${form.moveInBy}T00:00:00+09:00`).toISOString() : null,
                requirements: form.requirements.trim() || null,
                note: form.note.trim() || null,
              },
              '保存しました',
            )
          }
        >
          保存
        </button>
      </div>

      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <h3 className="text-xs font-bold text-slate-500">追客の設定</h3>
        <div>
          <label className="label">
            ステータスを手動で変更
            <span className="ml-1 text-xs font-normal text-slate-500">通常は操作の記録から自動で変わります</span>
          </label>
          <select
            className="input"
            value={form.status}
            onChange={(e) => {
              const status = e.target.value as CustomerStatus
              set('status', status)
              void save({ status }, `${CUSTOMER_STATUS_LABEL[status]}に変更し、次回アクションを引き直しました`)
            }}
            disabled={busy}
          >
            {CUSTOMER_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {CUSTOMER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">優先度を固定する</label>
          <select
            className="input"
            value={form.priorityOverride}
            onChange={(e) => {
              const value = e.target.value as FollowUpPriority | ''
              set('priorityOverride', value)
              void save({ priorityOverride: value === '' ? null : value }, '優先度の設定を保存しました')
            }}
            disabled={busy}
          >
            <option value="">自動判定にまかせる</option>
            {(['S', 'A', 'B', 'C'] as const).map((p) => (
              <option key={p} value={p}>
                {p}：{PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.autoFollowEnabled}
            disabled={busy}
            onChange={(e) => {
              set('autoFollowEnabled', e.target.checked)
              void save(
                { autoFollowEnabled: e.target.checked },
                e.target.checked ? '自動追客を再開しました' : '自動追客を停止しました',
              )
            }}
          />
          自動追客の対象にする
        </label>
      </div>

      {message ? (
        <p className={`mt-3 rounded px-3 py-2 text-sm ${message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  )
}
