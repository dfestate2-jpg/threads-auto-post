import { describe, expect, it } from 'vitest'

import {
  FIRST_DATA_ROW,
  buildDepositRows,
  formatSheetDate,
  lastDateKeyOf,
  monthlySheetTitle,
  parseExistingRows,
  parseSheetAmount,
  parseSheetDateKey,
  reconcileAppendedRows,
  trimTrailingBlankRows,
  type PendingDepositKey,
} from '@/lib/domain/depositSheet'
import { payerNameKey } from '@/lib/domain/payerName'
import { parseRangeStartRow } from '@/lib/sheets/client'

const TZ = 'Asia/Tokyo'

/** DATE 列と同じ「その日のUTC 0時」を作る */
function day(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

describe('monthlySheetTitle / formatSheetDate', () => {
  it('入金日の月から yyyyMM のシート名を作る', () => {
    expect(monthlySheetTitle(day('2026-08-27'), TZ)).toBe('202608')
    expect(monthlySheetTitle(day('2026-08-01'), TZ)).toBe('202608')
    expect(monthlySheetTitle(day('2026-08-31'), TZ)).toBe('202608')
    expect(monthlySheetTitle(day('2026-09-01'), TZ)).toBe('202609')
  })

  it('既存行と同じ 2026/08/27 形式で書く', () => {
    expect(formatSheetDate(day('2026-08-03'), TZ)).toBe('2026/08/03')
  })
})

describe('buildDepositRows', () => {
  const deposits = [
    { id: 'a', depositDate: day('2026-08-27'), payerName: 'タマホーム', amount: 519430 },
    { id: 'b', depositDate: day('2026-08-27'), payerName: 'ヤマダ タロウ', amount: 150000 },
    { id: 'c', depositDate: day('2026-08-28'), payerName: 'クボカイト', amount: 700000 },
  ]

  it('A・C・D列だけを埋め、B列（契約者名）は空のまま渡す', () => {
    const { values } = buildDepositRows(deposits, { timezone: TZ })
    expect(values[0]).toEqual(['2026/08/27', '', 'タマホーム', 519430])
    expect(values[0]).toHaveLength(4) // E列（契約締結日）以降は触らない
  })

  it('同じ入金日が続く2行目以降は日付を空欄にする（既存の手入力に合わせる）', () => {
    const { values } = buildDepositRows(deposits, { timezone: TZ })
    expect(values.map((r) => r[0])).toEqual(['2026/08/27', '', '2026/08/28'])
  })

  it('シート最終行と同じ日付なら、先頭行も日付を書かない', () => {
    const { values } = buildDepositRows(deposits, { timezone: TZ, lastExistingDateKey: '2026-08-27' })
    expect(values.map((r) => r[0])).toEqual(['', '', '2026/08/28'])
  })

  it('omitRepeatedDate=false なら毎行に日付を書く', () => {
    const { values } = buildDepositRows(deposits, { timezone: TZ, omitRepeatedDate: false })
    expect(values.map((r) => r[0])).toEqual(['2026/08/27', '2026/08/27', '2026/08/28'])
  })

  it('ids は入力と同じ並びで返る（追記後に行番号を対応づけるため）', () => {
    expect(buildDepositRows(deposits, { timezone: TZ }).ids).toEqual(['a', 'b', 'c'])
  })
})

describe('シートのセルの読み取り', () => {
  it('日付はいくつかの表示形式を許容する', () => {
    expect(parseSheetDateKey('2026/08/27')).toBe('2026-08-27')
    expect(parseSheetDateKey('2026-8-3')).toBe('2026-08-03')
    expect(parseSheetDateKey('2026年8月27日')).toBe('2026-08-27')
    expect(parseSheetDateKey('')).toBeNull()
    expect(parseSheetDateKey('タマホーム')).toBeNull()
    expect(parseSheetDateKey('8/27')).toBeNull()
  })

  it('金額は表示形式に関係なく数値にする', () => {
    expect(parseSheetAmount(519430)).toBe(519430)
    expect(parseSheetAmount('519,430')).toBe(519430)
    expect(parseSheetAmount('¥519,430')).toBe(519430)
    expect(parseSheetAmount('')).toBeNull()
    expect(parseSheetAmount(null)).toBeNull()
  })
})

describe('parseExistingRows', () => {
  const raw: unknown[][] = [
    ['2026/08/20', '', 'タマホーム', 519430, '', '紹介料'],
    ['', '久保楓弦', 'ティーライフ', 607188, '2026/03/30', '売買 広告料'],
    ['2026/08/21', '宮本 凌都', 'ミヤモトリョウト', 990000, '', '売買 仲介手数料'],
    [],
  ]

  it('空欄の入金日は上の行から引き継ぐ（同じ日は空欄という運用のため）', () => {
    const rows = parseExistingRows(raw, FIRST_DATA_ROW)
    expect(rows.map((r) => r.dateKey)).toEqual(['2026-08-20', '2026-08-20', '2026-08-21', '2026-08-21'])
  })

  it('行番号はシート上の実際の行になる', () => {
    const rows = parseExistingRows(raw, FIRST_DATA_ROW)
    expect(rows.map((r) => r.row)).toEqual([3, 4, 5, 6])
  })

  it('末尾の空行は落とせる', () => {
    const rows = trimTrailingBlankRows(parseExistingRows(raw, FIRST_DATA_ROW))
    expect(rows).toHaveLength(3)
  })
})

describe('reconcileAppendedRows（重複登録の防止）', () => {
  const existing = parseExistingRows(
    [
      ['2026/08/20', '', 'タマホーム', 519430, '', '紹介料'],
      ['', '久保楓弦', 'ティーライフ', 607188, '2026/03/30', '売買 広告料'],
    ],
    FIRST_DATA_ROW,
  )

  function pending(...items: Array<[string, string, string, number]>): PendingDepositKey[] {
    return items.map(([id, dateKey, payer, amount]) => ({
      id,
      dateKey,
      payerKey: payerNameKey(payer),
      amount,
    }))
  }

  it('シートに無い入金はすべて追記対象になる', () => {
    const result = reconcileAppendedRows(pending(['a', '2026-08-21', 'ミヤモトリョウト', 990000]), existing)
    expect(result.matched).toEqual([])
    expect(result.remaining).toHaveLength(1)
  })

  it('追記直後に落ちた分（末尾に一致）は追記せず、行番号だけ回収する', () => {
    const result = reconcileAppendedRows(
      pending(['a', '2026-08-20', 'ティーライフ', 607188], ['b', '2026-08-21', 'ミヤモトリョウト', 990000]),
      existing,
    )
    expect(result.matched).toEqual([{ id: 'a', row: 4 }])
    expect(result.remaining.map((r) => r.id)).toEqual(['b'])
  })

  it('複数行まとめて書けていた場合も、末尾から最長で一致させる', () => {
    const result = reconcileAppendedRows(
      pending(['a', '2026-08-20', 'タマホーム', 519430], ['b', '2026-08-20', 'ティーライフ', 607188]),
      existing,
    )
    expect(result.matched).toEqual([
      { id: 'a', row: 3 },
      { id: 'b', row: 4 },
    ])
    expect(result.remaining).toEqual([])
  })

  it('システムが止まっている間に人が手入力していた分も二重に書かない', () => {
    const result = reconcileAppendedRows(pending(['a', '2026-08-20', 'ティーライフ', 607188]), existing)
    expect(result.matched).toEqual([{ id: 'a', row: 4 }])
    expect(result.remaining).toEqual([])
  })

  it('金額が1円でも違えば別の入金として追記する', () => {
    const result = reconcileAppendedRows(pending(['a', '2026-08-20', 'ティーライフ', 607189]), existing)
    expect(result.matched).toEqual([])
    expect(result.remaining).toHaveLength(1)
  })

  it('入金者が違えば別の入金として追記する', () => {
    const result = reconcileAppendedRows(pending(['a', '2026-08-20', 'ティーライフ社', 607188]), existing)
    expect(result.matched).toEqual([])
    expect(result.remaining).toHaveLength(1)
  })

  it('入金者の全角・半角スペースの差は同じ入金とみなす', () => {
    const rows = parseExistingRows([['2026/08/20', '', 'クラハシ　ジユンヤ', 131234]], FIRST_DATA_ROW)
    const result = reconcileAppendedRows(pending(['a', '2026-08-20', 'クラハシ ジユンヤ', 131234]), rows)
    expect(result.matched).toEqual([{ id: 'a', row: 3 }])
  })

  it('空のシート（新しい月）では全件が追記対象', () => {
    const result = reconcileAppendedRows(pending(['a', '2026-09-01', 'タマホーム', 100]), [])
    expect(result.remaining).toHaveLength(1)
  })
})

describe('lastDateKeyOf', () => {
  it('末尾の空行を無視して最終行の入金日を返す', () => {
    const rows = parseExistingRows(
      [['2026/08/20', '', 'タマホーム', 519430], ['', '', 'ティーライフ', 607188], []],
      FIRST_DATA_ROW,
    )
    expect(lastDateKeyOf(rows)).toBe('2026-08-20')
  })

  it('データが無ければ null', () => {
    expect(lastDateKeyOf([])).toBeNull()
  })
})

describe('parseRangeStartRow', () => {
  it('追記された範囲から先頭行番号を取り出す', () => {
    expect(parseRangeStartRow("'202608'!A27:D29")).toBe(27)
    expect(parseRangeStartRow('202608!A3:D3')).toBe(3)
    expect(parseRangeStartRow('壊れた範囲')).toBeNull()
  })
})
