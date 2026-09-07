'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const STATUSES = [
  { value: '', label: 'すべての状況' },
  { value: 'UNHANDLED', label: '未対応' },
  { value: 'IN_PROGRESS', label: '対応中' },
  { value: 'DONE', label: '対応済み' },
  { value: 'NEEDS_CHECK', label: '要確認' },
]

export function CustomerFilters({
  staff,
  basePath = '/customers',
}: {
  staff: { id: string; name: string }[]
  basePath?: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    sp.delete('page')
    router.push(`${basePath}?${sp.toString()}`)
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3">
      <input
        className="input max-w-xs"
        placeholder="顧客名 / LINEユーザーIDで検索"
        defaultValue={params.get('q') ?? ''}
        onKeyDown={(e) => {
          if (e.key === 'Enter') update('q', (e.target as HTMLInputElement).value)
        }}
      />
      <select className="input max-w-[180px]" value={params.get('status') ?? ''} onChange={(e) => update('status', e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        className="input max-w-[200px]"
        value={params.get('assignee') ?? ''}
        onChange={(e) => update('assignee', e.target.value)}
      >
        <option value="">すべての担当者</option>
        <option value="none">担当者未設定</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={params.get('awaiting') !== '0'}
          onChange={(e) => update('awaiting', e.target.checked ? '' : '0')}
        />
        未返信のみ表示
      </label>
    </div>
  )
}
