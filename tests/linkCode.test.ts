import { describe, expect, it } from 'vitest'

import {
  LINK_CODE_LENGTH,
  extractLinkCode,
  formatLinkCode,
  generateLinkCode,
  hashLinkCode,
} from '@/lib/domain/linkCode'

describe('generateLinkCode', () => {
  it('決められた長さで、読み違えやすい文字を含まない', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateLinkCode()
      expect(code).toHaveLength(LINK_CODE_LENGTH)
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/)
      expect(code).not.toMatch(/[ILO01]/)
    }
  })

  it('毎回同じにはならない', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateLinkCode()))
    expect(seen.size).toBeGreaterThan(40)
  })
})

describe('hashLinkCode', () => {
  it('同じコードは同じハッシュ、違うコードは違うハッシュ', () => {
    expect(hashLinkCode('ABCD2345')).toBe(hashLinkCode('ABCD2345'))
    expect(hashLinkCode('ABCD2345')).not.toBe(hashLinkCode('ABCD2346'))
  })

  it('ハッシュに平文が含まれない', () => {
    expect(hashLinkCode('ABCD2345')).not.toContain('ABCD2345')
  })
})

describe('formatLinkCode', () => {
  it('4文字ずつ区切る', () => {
    expect(formatLinkCode('ABCD2345')).toBe('ABCD-2345')
  })
})

describe('extractLinkCode', () => {
  it.each([
    ['ABCD2345', 'ABCD2345'],
    ['ABCD-2345', 'ABCD2345'],
    ['abcd2345', 'ABCD2345'],
    ['登録 ABCD2345', 'ABCD2345'],
    ['コード：ABCD-2345', 'ABCD2345'],
    ['ABCD 2345', 'ABCD2345'],
    ['  ABCD2345  ', 'ABCD2345'],
    ['ABCDー2345', 'ABCD2345'],
  ])('「%s」からコードを取り出せる', (input, expected) => {
    expect(extractLinkCode(input)).toBe(expected)
  })

  it('コードが無い発言では null になる（雑談に反応しない）', () => {
    for (const text of [null, undefined, '', 'おはようございます', '123', 'ABCDEFGHIJK', 'ABCD234']) {
      expect(extractLinkCode(text)).toBeNull()
    }
  })

  it('除外文字を含む8文字はコードとみなさない', () => {
    expect(extractLinkCode('ABCD2I45')).toBeNull()
    expect(extractLinkCode('ABCD2O45')).toBeNull()
  })

  it('文中に混ざっていても拾える', () => {
    expect(extractLinkCode('連携コードは ABCD2345 です')).toBe('ABCD2345')
  })
})
