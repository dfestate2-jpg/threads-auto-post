'use client'

import { RowSelect } from './RowSelect'

/** 「未設定」を表す選択肢の値。API へは null として送る */
const UNASSIGNED = ''

/**
 * 一覧から担当者を直接変えるためのプルダウン。
 *
 * 担当者はリマインドの宛先と本文に出るため、**未設定のまま放置されるのが一番困る。**
 * 誰の案件か分からないまま通知だけが流れ、結局誰も動かない。
 * 一覧で未設定が目に入り、その場で直せることが要点なので、
 * 未設定のときだけ配色を変えて目立たせる。
 *
 * 確認ダイアログは挟まない。担当の付け替えはいつでも戻せる操作で、
 * 毎回確認を出すと本来の狙い（その場でさっと直せる）を潰してしまう。
 */
export function AssigneeSelect({
  customerId,
  customerName,
  value,
  valueName,
  staff,
  version,
}: {
  customerId: string
  customerName: string
  value: string | null
  /** 現在の担当者名。選択肢に無い担当者を表示するために使う */
  valueName: string | null
  staff: { id: string; name: string }[]
  version: number
}) {
  /**
   * 退職などで無効化された担当者が割り当たっていることがある。
   * 選択肢に無い値を select に渡すとブラウザは黙って先頭を選ぶので、
   * **画面上は別人が担当しているように見えてしまう。** それを防ぐために、
   * 現在の担当者が一覧に居なければ末尾に足しておく。
   */
  const extra =
    value && !staff.some((s) => s.id === value)
      ? [{ value, label: `${valueName ?? '不明な担当者'}（無効）` }]
      : []

  return (
    <RowSelect
      customerId={customerId}
      value={value ?? UNASSIGNED}
      options={[
        { value: UNASSIGNED, label: '担当 未設定' },
        ...staff.map((s) => ({ value: s.id, label: s.name })),
        ...extra,
      ]}
      version={version}
      ariaLabel={`${customerName} 様の担当者`}
      tone={(v) =>
        v === UNASSIGNED ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-700'
      }
      buildPayload={(next) => ({ assigneeId: next === UNASSIGNED ? null : next })}
    />
  )
}
