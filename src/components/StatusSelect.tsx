'use client'

import { HandlingStatus } from '@prisma/client'

import { RowSelect } from './RowSelect'

const OPTIONS = [
  { value: 'UNHANDLED', label: '未対応' },
  { value: 'IN_PROGRESS', label: '対応中' },
  { value: 'DONE', label: '対応済み' },
  { value: 'NEEDS_CHECK', label: '要確認' },
]

/** 一覧でも状況が一目で分かるよう、詳細画面のバッジと同じ配色にする */
const TONE: Record<string, string> = {
  UNHANDLED: 'border-red-200 bg-red-50 text-red-800',
  IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-800',
  DONE: 'border-green-200 bg-green-50 text-green-800',
  NEEDS_CHECK: 'border-purple-200 bg-purple-50 text-purple-800',
}

/**
 * 一覧から対応状況を直接変えるためのプルダウン。
 *
 * 「対応済み」はリマインドを止める確定操作なので、**選んだ時点で確認を挟む。**
 * 一覧では行が並んでいて隣の顧客を触りやすく、取り違えると
 * 「対応していない案件のリマインドが止まる」という一番まずい事故になる。
 */
export function StatusSelect({
  customerId,
  customerName,
  value,
  version,
}: {
  customerId: string
  customerName: string
  value: HandlingStatus
  version: number
}) {
  return (
    <RowSelect
      customerId={customerId}
      value={value}
      options={OPTIONS}
      version={version}
      ariaLabel={`${customerName} 様の対応状況`}
      tone={(v) => TONE[v] ?? ''}
      buildPayload={(next) => ({ handlingStatus: next })}
      confirmMessage={(next) =>
        next === 'DONE' ? `${customerName} 様を対応済みにします。以降のリマインドは停止します。` : null
      }
    />
  )
}
