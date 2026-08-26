import { describe, expect, it } from 'vitest'

import { buildResolveActionData, parseQuickActionData } from '@/lib/line/quickAction'

const SECRET = 'test-quick-action-secret'
const CUSTOMER = 'clx0000000000000000000000'
const CYCLE = 1_756_200_000_000

describe('quickAction', () => {
  it('署名したデータを復元できる', () => {
    const data = buildResolveActionData({ customerId: CUSTOMER, cycleId: CYCLE }, SECRET)
    expect(data).not.toBeNull()
    expect(parseQuickActionData(data, SECRET)).toEqual({
      kind: 'RESOLVE',
      customerId: CUSTOMER,
      cycleId: CYCLE,
    })
  })

  it('LINE の postback データ上限（300文字）に収まる', () => {
    const data = buildResolveActionData({ customerId: CUSTOMER, cycleId: CYCLE }, SECRET)
    expect(data!.length).toBeLessThanOrEqual(300)
  })

  it('別の鍵では検証に失敗する', () => {
    const data = buildResolveActionData({ customerId: CUSTOMER, cycleId: CYCLE }, SECRET)
    expect(parseQuickActionData(data, 'another-secret')).toBeNull()
  })

  it('顧客IDを差し替えると検証に失敗する（他人の会話を閉じられない）', () => {
    const data = buildResolveActionData({ customerId: CUSTOMER, cycleId: CYCLE }, SECRET)!
    const tampered = data.replace(CUSTOMER, 'clx1111111111111111111111')
    expect(parseQuickActionData(tampered, SECRET)).toBeNull()
  })

  it('サイクルIDを差し替えると検証に失敗する', () => {
    const data = buildResolveActionData({ customerId: CUSTOMER, cycleId: CYCLE }, SECRET)!
    const tampered = data.replace(String(CYCLE), String(CYCLE + 1))
    expect(parseQuickActionData(tampered, SECRET)).toBeNull()
  })

  it('未返信サイクルが違えば別のデータになる（古いボタンで新しい未返信を閉じない）', () => {
    const a = buildResolveActionData({ customerId: CUSTOMER, cycleId: CYCLE }, SECRET)
    const b = buildResolveActionData({ customerId: CUSTOMER, cycleId: CYCLE + 60_000 }, SECRET)
    expect(a).not.toEqual(b)
    expect(parseQuickActionData(b, SECRET)?.cycleId).toBe(CYCLE + 60_000)
  })

  it('壊れた入力はすべて null になる', () => {
    for (const bad of [null, undefined, '', 'v1.R.abc', 'v1.R.abc.123', 'v2.R.abc.123.sig', 'x'.repeat(400)]) {
      expect(parseQuickActionData(bad, SECRET)).toBeNull()
    }
  })

  it('IDに区切り文字が混ざる場合は組み立てを拒否する', () => {
    expect(buildResolveActionData({ customerId: 'a.b', cycleId: CYCLE }, SECRET)).toBeNull()
  })
})
