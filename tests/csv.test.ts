import { describe, expect, it } from 'vitest'

import {
  mapHeaders,
  parseBudgetMan,
  parseConsent,
  parseContactsCsv,
  parseCsv,
  parsePropertyTypes,
  splitList,
} from '@/lib/domain/csv'
import { normalizeEmail, normalizePhone } from '@/lib/email/address'

describe('parseCsv', () => {
  it('引用符の中のカンマと改行を1つのフィールドとして読む', () => {
    const rows = parseCsv('a,"b,c","d\ne"\n1,2,3')
    expect(rows[0]).toEqual(['a', 'b,c', 'd\ne'])
    expect(rows[1]).toEqual(['1', '2', '3'])
  })

  it('二重引用符のエスケープを解く', () => {
    expect(parseCsv('"say ""hi"""')[0]).toEqual(['say "hi"'])
  })

  it('BOM と CRLF を取り除く', () => {
    const rows = parseCsv('﻿メールアドレス,名前\r\na@example.com,山田\r\n')
    expect(rows[0]).toEqual(['メールアドレス', '名前'])
    expect(rows).toHaveLength(2)
  })

  it('空行は落とす', () => {
    expect(parseCsv('a\n\n\nb')).toHaveLength(2)
  })
})

describe('mapHeaders', () => {
  it('日本語・英語・表記揺れを同じ列として認識する', () => {
    expect(mapHeaders(['メールアドレス', 'お名前', '電話 番号'])).toEqual({ email: 0, name: 1, phone: 2 })
    expect(mapHeaders(['E-Mail', 'Name'])).toEqual({ email: 0, name: 1 })
  })

  it('知らない列は無視する', () => {
    expect(mapHeaders(['担当', 'email'])).toEqual({ email: 1 })
  })
})

describe('parseBudgetMan', () => {
  it('万円・億円・円表記をすべて万円に揃える', () => {
    expect(parseBudgetMan('5000万')).toBe(5000)
    expect(parseBudgetMan('5,000万円')).toBe(5000)
    expect(parseBudgetMan('1億')).toBe(10000)
    expect(parseBudgetMan('1億2000万')).toBe(12000)
    expect(parseBudgetMan('50000000')).toBe(5000)
    expect(parseBudgetMan('3480')).toBe(3480)
  })

  it('読めない値は null', () => {
    expect(parseBudgetMan('応相談')).toBeNull()
    expect(parseBudgetMan('')).toBeNull()
    expect(parseBudgetMan(undefined)).toBeNull()
  })
})

describe('parseConsent', () => {
  it('曖昧な値を「同意あり」に倒さない', () => {
    expect(parseConsent('検討中')).toBe('UNKNOWN')
    expect(parseConsent(undefined)).toBe('UNKNOWN')
    expect(parseConsent('')).toBe('UNKNOWN')
  })

  it('明示的な同意・拒否だけを読み取る', () => {
    expect(parseConsent('同意する')).toBe('OPTED_IN')
    expect(parseConsent('yes')).toBe('OPTED_IN')
    expect(parseConsent('配信停止')).toBe('UNSUBSCRIBED')
    expect(parseConsent('NG')).toBe('UNSUBSCRIBED')
  })
})

describe('parsePropertyTypes / splitList', () => {
  it('区切り文字の揺れを吸収する', () => {
    expect(splitList('世田谷区、目黒区/渋谷区')).toEqual(['世田谷区', '目黒区', '渋谷区'])
  })

  it('日本語の種別をenumに寄せる', () => {
    expect(parsePropertyTypes('中古マンション、戸建')).toEqual(['MANSION', 'HOUSE'])
    expect(parsePropertyTypes('収益一棟')).toEqual(['INVESTMENT'])
    expect(parsePropertyTypes('よくわからない')).toEqual(['OTHER'])
  })
})

describe('normalizeEmail', () => {
  it('大文字・全角・前後空白を正規化する', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com')
    expect(normalizeEmail('ｆｏｏ@example.com')).toBe('foo@example.com')
  })

  it('不正な形式は null にする', () => {
    expect(normalizeEmail('foo@')).toBeNull()
    expect(normalizeEmail('foo@bar')).toBeNull()
    expect(normalizeEmail('a b@example.com')).toBeNull()
    expect(normalizeEmail('')).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('ハイフン・国番号を落として国内表記に揃える', () => {
    expect(normalizePhone('090-1234-5678')).toBe('09012345678')
    expect(normalizePhone('+81 90 1234 5678')).toBe('09012345678')
    expect(normalizePhone('03(1234)5678')).toBe('0312345678')
  })

  it('桁数が合わないものは null', () => {
    expect(normalizePhone('1234')).toBeNull()
  })
})

describe('parseContactsCsv', () => {
  it('見出しを認識して行を取り込む', () => {
    const csv = [
      'メールアドレス,お名前,電話番号,希望エリア,予算,配信同意',
      'A@Example.com,山田太郎,090-1234-5678,"世田谷区、目黒区",5000万,同意する',
      'b@example.com,鈴木,,渋谷区,1億,',
    ].join('\n')

    const result = parseContactsCsv(csv, normalizeEmail)
    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(2)

    expect(result.rows[0]).toMatchObject({
      email: 'a@example.com',
      name: '山田太郎',
      areas: ['世田谷区', '目黒区'],
      budgetMax: 5000,
      consent: 'OPTED_IN',
    })
    // 同意列が空欄なら「同意あり」にはしない
    expect(result.rows[1]?.consent).toBe('UNKNOWN')
    expect(result.rows[1]?.budgetMax).toBe(10000)
  })

  it('メールアドレスの列が無ければ取り込まない', () => {
    const result = parseContactsCsv('名前,電話\n山田,090', normalizeEmail)
    expect(result.rows).toHaveLength(0)
    expect(result.errors[0]?.column).toBe('email')
  })

  it('不正なアドレスとファイル内重複を行番号つきで弾く', () => {
    const csv = ['email', 'a@example.com', 'こわれた', 'A@EXAMPLE.COM'].join('\n')
    const result = parseContactsCsv(csv, normalizeEmail)

    expect(result.rows).toHaveLength(1)
    expect(result.errors.map((e) => e.line)).toEqual([3, 4])
    expect(result.errors[1]?.reason).toContain('重複')
  })
})
