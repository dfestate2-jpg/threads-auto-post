/**
 * 既存スプレッドシートの形に合わせて、入金明細を「行」に組み立てる純粋ロジック。
 *
 * 実際のシート（月次シート）の構造
 *   1行目 : 空
 *   2行目 : 見出し  A:入金日 / B:契約者名 / C:入金者 / D:入金額 / E:契約締結日 / F:備考
 *   3行目〜: データ
 *
 * 運用上の約束
 *   - シート名は入金月の "yyyyMM"（例: 202608）。無ければ「コピー」シートを複製して作る
 *   - **同じ入金日が続く場合、2行目以降の A列は空欄**（既存の手入力がこの形）
 *   - B / E / F は人が埋める列。システムは絶対に触らない
 */

import { formatInTimeZone } from 'date-fns-tz'

import { payerNameKey } from './payerName'

/** 見出し行 */
export const HEADER_ROW = 2
/** データの開始行 */
export const FIRST_DATA_ROW = 3
/**
 * 追記・読み取りの対象範囲。
 *
 * 書き込みも A:F を渡す。Sheets の append は「範囲内の表の最終行」の次に書くため、
 * 人しか入力しない E・F 列も範囲に含めないと最終行を取り違える。
 * 実際に渡す行は4要素（A〜D）なので、**E・F は書き換わらない**。
 */
export const WRITE_COLUMN_RANGE = 'A:F'
export const READ_COLUMN_RANGE = 'A:F'
/** 読み取り範囲の最終列 */
export const LAST_COLUMN = 'F'

export const COLUMN_INDEX = {
  depositDate: 0,
  contractorName: 1,
  payerName: 2,
  amount: 3,
  contractDate: 4,
  note: 5,
} as const

/** 入金日が属する月次シート名（例 "202608"） */
export function monthlySheetTitle(depositDate: Date, timezone: string): string {
  return formatInTimeZone(depositDate, timezone, 'yyyyMM')
}

/** シートに書き込む日付表記（既存行と同じ 2026/08/27 形式） */
export function formatSheetDate(depositDate: Date, timezone: string): string {
  return formatInTimeZone(depositDate, timezone, 'yyyy/MM/dd')
}

/** 突合用の日付キー（yyyy-MM-dd） */
export function dateKeyOfDeposit(depositDate: Date, timezone: string): string {
  return formatInTimeZone(depositDate, timezone, 'yyyy-MM-dd')
}

export interface DepositRowInput {
  id: string
  depositDate: Date
  payerName: string
  amount: number
}

export type SheetCellValue = string | number

export interface BuiltRows {
  /** values.append にそのまま渡す2次元配列（A〜D列） */
  values: SheetCellValue[][]
  /** values[i] が deposits[i] に対応する（順序は入力と同じ） */
  ids: string[]
}

export interface BuildRowsOptions {
  timezone: string
  /**
   * 同じ入金日が連続するとき、2行目以降の日付を空欄にする（既定 true）。
   * 既存の手入力の見た目に合わせるための設定。
   */
  omitRepeatedDate?: boolean
  /** すでにシートの最終行に入っている日付キー（そこから連続扱いにするため） */
  lastExistingDateKey?: string | null
}

/**
 * 入金明細を、そのままシートへ追記できる行に変換する。
 * B列（契約者名）は人が埋める列なので空文字で通過させ、E以降は書き込まない。
 */
export function buildDepositRows(deposits: DepositRowInput[], options: BuildRowsOptions): BuiltRows {
  const omitRepeatedDate = options.omitRepeatedDate ?? true
  let previousDateKey = options.lastExistingDateKey ?? null

  const values: SheetCellValue[][] = []
  const ids: string[] = []

  for (const deposit of deposits) {
    const dateKey = dateKeyOfDeposit(deposit.depositDate, options.timezone)
    const showDate = !omitRepeatedDate || dateKey !== previousDateKey
    values.push([
      showDate ? formatSheetDate(deposit.depositDate, options.timezone) : '',
      '', // B列: 契約者名（人が入力）
      deposit.payerName,
      deposit.amount,
    ])
    ids.push(deposit.id)
    previousDateKey = dateKey
  }

  return { values, ids }
}

// ---------------------------------------------------------------------------
// 既存行の読み取り（突合に使う）
// ---------------------------------------------------------------------------

/**
 * シートの日付セルを yyyy-MM-dd に丸める。
 * 表示形式が "2026/08/27" でも "2026-08-27" でも "2026年8月27日" でも拾えるようにする。
 * 判定できないときは null（突合では日付を無視する）。
 */
export function parseSheetDateKey(cell: unknown): string | null {
  if (cell === null || cell === undefined) return null
  const text = String(cell).trim()
  if (text.length === 0) return null

  const groups = text.match(/\d+/g)
  if (!groups || groups.length < 3) return null

  const [a, b, c] = groups
  if (!a || !b || !c) return null
  // 先頭が4桁なら yyyy m d とみなす（日本語圏の表記はすべてこの並び）
  if (a.length !== 4) return null

  const year = Number(a)
  const month = Number(b)
  const day = Number(c)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** シートの金額セルを数値に丸める（"300,000" / "¥300,000" / 300000 のいずれでも） */
export function parseSheetAmount(cell: unknown): number | null {
  if (cell === null || cell === undefined) return null
  if (typeof cell === 'number') return Number.isFinite(cell) ? Math.round(cell) : null
  const text = String(cell).replace(/[^\d.-]/g, '')
  if (text.length === 0) return null
  const value = Number(text)
  return Number.isFinite(value) ? Math.round(value) : null
}

export interface ExistingSheetRow {
  /** シート上の行番号（1始まり） */
  row: number
  dateKey: string | null
  payerKey: string
  amount: number | null
  /** A〜F のいずれかに値があるか（末尾の空行を落とすために使う） */
  hasValue: boolean
}

/**
 * values.get の生の2次元配列を、突合しやすい形に直す。
 *
 * A列（入金日）は「同じ日付なら空欄」という運用なので、
 * **上の行の日付を引き継ぐ（前方補完）**。
 */
export function parseExistingRows(rows: unknown[][], startRow: number): ExistingSheetRow[] {
  const parsed: ExistingSheetRow[] = []
  let carriedDateKey: string | null = null

  rows.forEach((row, index) => {
    const cells = row ?? []
    const dateKey = parseSheetDateKey(cells[COLUMN_INDEX.depositDate])
    if (dateKey) carriedDateKey = dateKey

    const payerRaw = cells[COLUMN_INDEX.payerName]
    const amount = parseSheetAmount(cells[COLUMN_INDEX.amount])
    const hasValue = cells.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')

    parsed.push({
      row: startRow + index,
      dateKey: dateKey ?? carriedDateKey,
      payerKey: payerNameKey(payerRaw === null || payerRaw === undefined ? '' : String(payerRaw)),
      amount,
      hasValue,
    })
  })

  return parsed
}

/** 末尾の空行を落とす（追記位置と突合の基準をそろえるため） */
export function trimTrailingBlankRows(rows: ExistingSheetRow[]): ExistingSheetRow[] {
  let end = rows.length
  while (end > 0 && !rows[end - 1]?.hasValue) end -= 1
  return rows.slice(0, end)
}

export interface PendingDepositKey {
  id: string
  dateKey: string
  payerKey: string
  amount: number
}

export interface ReconcileResult {
  /** すでにシートに載っていた分（＝追記直後に落ちた／人が先に手入力していた） */
  matched: Array<{ id: string; row: number }>
  /** まだ載っていないので追記が必要な分 */
  remaining: PendingDepositKey[]
}

function rowMatches(row: ExistingSheetRow, candidate: PendingDepositKey): boolean {
  if (row.amount === null || row.amount !== candidate.amount) return false
  if (row.payerKey !== candidate.payerKey) return false
  // 日付はシート側が読み取れたときだけ照合する（表示形式に依存しないため）
  return row.dateKey === null || row.dateKey === candidate.dateKey
}

/**
 * 「DBでは未反映(PENDING)だが、実際にはシートに載っている」行を拾い直す。
 *
 * 追記APIは成功したのに、その直後にプロセスが落ちて SYNCED を書けなかった場合、
 * 何もしなければ次回の実行で同じ入金をもう一度追記してしまう。
 *
 * 追記は必ず表の末尾に、未反映分の並び順どおりに入る。
 * したがって「シート末尾の j 行が、未反映の先頭 j 件と一致するか」を
 * **j が最大になるところで判定すれば、既に載っている分を正確に特定できる**。
 *
 * 副次的に、システムが止まっている間に人が同じ入金を手入力していた場合も
 * 一致すれば追記しない（＝重複しない）。
 */
export function reconcileAppendedRows(
  pending: PendingDepositKey[],
  existing: ExistingSheetRow[],
): ReconcileResult {
  const rows = trimTrailingBlankRows(existing)
  const maxOverlap = Math.min(pending.length, rows.length)

  for (let j = maxOverlap; j >= 1; j -= 1) {
    const tail = rows.slice(rows.length - j)
    const head = pending.slice(0, j)
    const allMatch = tail.every((row, index) => {
      const candidate = head[index]
      return candidate !== undefined && rowMatches(row, candidate)
    })
    if (allMatch) {
      return {
        matched: head.map((candidate, index) => ({
          id: candidate.id,
          row: tail[index]?.row ?? 0,
        })),
        remaining: pending.slice(j),
      }
    }
  }

  return { matched: [], remaining: pending }
}

/** 追記後にシート末尾となる日付キー（日付の重複表示を抑えるために使う） */
export function lastDateKeyOf(rows: ExistingSheetRow[]): string | null {
  const trimmed = trimTrailingBlankRows(rows)
  return trimmed[trimmed.length - 1]?.dateKey ?? null
}
