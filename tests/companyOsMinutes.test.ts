import { describe, expect, it } from 'vitest'

import { extractFromMinutes, MINUTES_SAMPLE } from '@/lib/company-os/minutes'

const HELD_AT = new Date('2026-09-08T01:00:00.000Z')

describe('extractFromMinutes', () => {
  it('見出しごとに種類を切り替える', () => {
    const result = extractFromMinutes(MINUTES_SAMPLE, HELD_AT)
    const kinds = result.items.map((i) => i.kind)
    expect(kinds.filter((k) => k === 'decision')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'task')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'issue')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'question')).toHaveLength(1)
  })

  it('担当者と期限を取り出し、本文からは取り除く', () => {
    const result = extractFromMinutes('## タスク\n・営業資料を作る 担当:山田 期限:10/15', HELD_AT)
    const item = result.items[0]
    expect(item?.text).toBe('営業資料を作る')
    expect(item?.assignee).toBe('山田')
    expect(item?.due).toBe('2026-10-15')
  })

  it('年つきの期限も読める', () => {
    const result = extractFromMinutes('## タスク\n・登記する 期限:2027-01-05', HELD_AT)
    expect(result.items[0]?.due).toBe('2027-01-05')
  })

  it('行頭の書き出しは見出しより優先する', () => {
    const result = extractFromMinutes('## タスク\n・決定：代表者は佐藤にする\n・資料を作る', HELD_AT)
    expect(result.items[0]?.kind).toBe('decision')
    expect(result.items[0]?.text).toBe('代表者は佐藤にする')
    expect(result.items[1]?.kind).toBe('task')
  })

  it('種類が判別できない行は数えるだけで取り込まない', () => {
    const result = extractFromMinutes('雑談：来週は暑いらしい\n世間話をした', HELD_AT)
    expect(result.items).toHaveLength(0)
    expect(result.skipped).toBe(2)
  })

  it('空の議事録でも壊れない', () => {
    expect(extractFromMinutes('', HELD_AT)).toEqual({ items: [], skipped: 0 })
  })

  it('箇条書きの記号と番号を取り除く', () => {
    const result = extractFromMinutes('【決定事項】\n1. 会社名はA社にする\n- 資本金は100万円', HELD_AT)
    expect(result.items.map((i) => i.text)).toEqual(['会社名はA社にする', '資本金は100万円'])
  })

  it('@記法の担当者も読める', () => {
    const result = extractFromMinutes('## タスク\n・口座を開設する @佐藤', HELD_AT)
    expect(result.items[0]?.assignee).toBe('佐藤')
  })
})
