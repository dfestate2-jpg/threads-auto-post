'use client'

import { useRouter, useSearchParams } from 'next/navigation'

import { CUSTOMER_STATUS_LABEL, CUSTOMER_STATUS_ORDER } from '@/lib/domain/followUp'

const VIEWS = [
  { value: '', label: '追客中のみ' },
  { value: 'overdue', label: '期限超過' },
  { value: 'today', label: '今日の追客' },
  { value: 'no_reply', label: '返信なし' },
  { value: 'dormant', label: '休眠' },
  { value: 'contracted', label: '成約' },
  { value: 'lost', label: '失注' },
  { value: 'all', label: 'すべて' },
]

/** 顧客一覧の絞り込み。管理者が「未対応」「期限超過」をすぐ出せることを優先する【指示書 14】 */
export function CustomerListFilters({ staff }: { staff: { id: string; name: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    sp.delete('page')
    router.push(`/customers?${sp.toString()}`)
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3">
      <input
        className="input max-w-xs"
        placeholder="顧客名 / 電話番号で検索"
        defaultValue={params.get('q') ?? ''}
        onKeyDown={(e) => {
          if (e.key === 'Enter') update('q', (e.target as HTMLInputElement).value)
        }}
      />
      <select className="input max-w-[160px]" value={params.get('view') ?? ''} onChange={(e) => update('view', e.target.value)}>
        {VIEWS.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
      <select className="input max-w-[180px]" value={params.get('status') ?? ''} onChange={(e) => update('status', e.target.value)}>
        <option value="">すべてのステータス</option>
        {CUSTOMER_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {CUSTOMER_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select className="input max-w-[200px]" value={params.get('assignee') ?? ''} onChange={(e) => update('assignee', e.target.value)}>
        <option value="">すべての担当者</option>
        <option value="none">担当者未設定</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
