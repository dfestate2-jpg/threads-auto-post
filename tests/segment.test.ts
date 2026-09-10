import { describe, expect, it } from 'vitest'

import { DEFAULT_SEGMENT, buildContactWhere, describeSegment } from '@/lib/services/segment'

const NOW = new Date('2026-08-28T00:00:00.000Z')

/** where 句のトップレベル AND から、指定キーを持つ条件を取り出す */
function conditions(where: ReturnType<typeof buildContactWhere>): Record<string, unknown>[] {
  return (where.AND as Record<string, unknown>[]) ?? []
}

describe('buildContactWhere', () => {
  it('配信停止した人は、どの条件でも必ず除外される', () => {
    for (const seg of [
      DEFAULT_SEGMENT,
      { ...DEFAULT_SEGMENT, optedInOnly: false },
      { ...DEFAULT_SEGMENT, lineSilentOnly: true, areas: ['世田谷区'] },
    ]) {
      const c = conditions(buildContactWhere(seg, NOW))
      expect(c).toContainEqual({ active: true })
      expect(c).toContainEqual({ unsubscribedAt: null })
      expect(c).toContainEqual({ consent: { not: 'UNSUBSCRIBED' } })
    }
  })

  it('既定では同意が確認できている人だけを対象にする', () => {
    expect(DEFAULT_SEGMENT.optedInOnly).toBe(true)
    expect(conditions(buildContactWhere(DEFAULT_SEGMENT, NOW))).toContainEqual({ consent: 'OPTED_IN' })
  })

  it('同意条件を外しても、配信停止の除外は残る', () => {
    const c = conditions(buildContactWhere({ ...DEFAULT_SEGMENT, optedInOnly: false }, NOW))
    expect(c).not.toContainEqual({ consent: 'OPTED_IN' })
    expect(c).toContainEqual({ consent: { not: 'UNSUBSCRIBED' } })
  })

  it('エリアと種別は「どれかに当てはまる」で絞る', () => {
    const c = conditions(buildContactWhere({ ...DEFAULT_SEGMENT, areas: ['世田谷区', '目黒区'] }, NOW))
    expect(c).toContainEqual({ areas: { hasSome: ['世田谷区', '目黒区'] } })
  })

  it('予算未登録の人を価格帯の条件で取りこぼさない', () => {
    const c = conditions(buildContactWhere({ ...DEFAULT_SEGMENT, budgetMin: 3000, budgetMax: 6000 }, NOW))
    expect(c).toContainEqual({ OR: [{ budgetMax: null }, { budgetMax: { gte: 3000 } }] })
    expect(c).toContainEqual({ OR: [{ budgetMin: null }, { budgetMin: { lte: 6000 } }] })
  })

  it('LINE未反応の条件は「LINEに居ない／ブロック済み／期間内に発信なし」を含む', () => {
    const c = conditions(buildContactWhere({ ...DEFAULT_SEGMENT, lineSilentOnly: true, lineSilentDays: 30 }, NOW))
    const silent = c.find((x) => Array.isArray(x.OR) && (x.OR as unknown[]).length === 3)
    expect(silent).toBeDefined()

    const or = silent!.OR as Record<string, unknown>[]
    expect(or[0]).toEqual({ customerId: null })
    expect(or[1]).toEqual({ customer: { blocked: true } })

    const since = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    expect(or[2]).toEqual({ customer: { messages: { none: { direction: 'INBOUND', sentAt: { gte: since } } } } })
  })

  it('LINE未反応の条件を使わないときは、その条件を足さない', () => {
    const c = conditions(buildContactWhere(DEFAULT_SEGMENT, NOW))
    expect(c.some((x) => Array.isArray(x.OR) && (x.OR as unknown[]).length === 3)).toBe(false)
  })
})

describe('describeSegment', () => {
  it('管理画面に出す説明を組み立てる', () => {
    const lines = describeSegment({
      ...DEFAULT_SEGMENT,
      areas: ['世田谷区'],
      budgetMax: 6000,
      lineSilentOnly: true,
      lineSilentDays: 14,
    })
    expect(lines[0]).toContain('配信同意あり')
    expect(lines.join('\n')).toContain('14日以上反応が無い')
    expect(lines.join('\n')).toContain('世田谷区')
    expect(lines.join('\n')).toContain('6,000万円')
  })
})
