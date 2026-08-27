/**
 * Google Sheets API v4 の薄いクライアント。
 * 使うのは「読む」「末尾に足す」「月次シートを作る」の3つだけ。
 */

import { env } from '@/lib/env'

import { getSheetsAccessToken } from './auth'

const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export class SheetsApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string,
  ) {
    super(`Sheets API ${path} responded ${status}: ${body.slice(0, 300)}`)
    this.name = 'SheetsApiError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const backoffMs = [1_000, 3_000, 8_000]
  for (let attempt = 0; ; attempt += 1) {
    const token = await getSheetsAccessToken()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
      if (res.ok) return (await res.json()) as T

      const body = await res.text()
      const retryable = res.status === 429 || res.status >= 500
      if (retryable && attempt < backoffMs.length) {
        await sleep(backoffMs[attempt] ?? 1_000)
        continue
      }
      throw new SheetsApiError(res.status, path, body)
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * A1記法のシート名を安全に引用する。
 * "202608" のような数字だけの名前は、引用しないと範囲として解釈されてしまう。
 */
export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`
}

export function a1Range(title: string, range: string): string {
  return `${quoteSheetTitle(title)}!${range}`
}

export interface SheetProperties {
  sheetId: number
  title: string
  index: number
}

export async function listSheets(): Promise<SheetProperties[]> {
  const data = await request<{ sheets?: Array<{ properties: SheetProperties }> }>(
    `/${env.depositSpreadsheetId}?fields=sheets.properties(sheetId,title,index)`,
  )
  return (data.sheets ?? []).map((s) => s.properties)
}

/** テンプレート（「コピー」シート）を複製して、月次シートを作る */
export async function duplicateSheet(
  sourceSheetId: number,
  newSheetName: string,
  insertSheetIndex: number,
): Promise<SheetProperties> {
  const data = await request<{
    replies?: Array<{ duplicateSheet?: { properties: SheetProperties } }>
  }>(`/${env.depositSpreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ duplicateSheet: { sourceSheetId, newSheetName, insertSheetIndex } }],
    }),
  })
  const properties = data.replies?.[0]?.duplicateSheet?.properties
  if (!properties) throw new Error(`シート ${newSheetName} の作成に失敗しました`)
  return properties
}

/**
 * 範囲を読む。
 * `UNFORMATTED_VALUE` + `FORMATTED_STRING` にすることで、
 * 金額は数値のまま、日付は表示どおりの文字列で受け取れる。
 */
export async function readValues(title: string, range: string): Promise<unknown[][]> {
  const encoded = encodeURIComponent(a1Range(title, range))
  const data = await request<{ values?: unknown[][] }>(
    `/${env.depositSpreadsheetId}/values/${encoded}` +
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  )
  return data.values ?? []
}

export interface AppendResult {
  /** 実際に書き込まれた範囲（例: "'202608'!A27:D29"） */
  updatedRange: string
  updatedRows: number
}

/**
 * 範囲の末尾に行を追加する。
 *
 * - `insertDataOption=INSERT_ROWS`：既存行を上書きせず、行を挿入して書く。
 *   表の下に人がメモを置いていても壊さない。
 * - `valueInputOption=USER_ENTERED`：日付は日付として、金額は数値として入る。
 */
export async function appendValues(
  title: string,
  range: string,
  values: Array<Array<string | number>>,
): Promise<AppendResult> {
  const encoded = encodeURIComponent(a1Range(title, range))
  const data = await request<{ updates?: { updatedRange?: string; updatedRows?: number } }>(
    `/${env.depositSpreadsheetId}/values/${encoded}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&responseValueRenderOption=UNFORMATTED_VALUE`,
    { method: 'POST', body: JSON.stringify({ values }) },
  )
  const updatedRange = data.updates?.updatedRange
  if (!updatedRange) throw new Error('Sheets API が updatedRange を返しませんでした')
  return { updatedRange, updatedRows: data.updates?.updatedRows ?? values.length }
}

/**
 * "'202608'!A27:D29" のような範囲から先頭行番号を取り出す。
 * 追記した行が何行目になったかを記録し、突合（重複防止）に使う。
 */
export function parseRangeStartRow(updatedRange: string): number | null {
  const cellPart = updatedRange.includes('!') ? updatedRange.slice(updatedRange.indexOf('!') + 1) : updatedRange
  const match = /^[A-Z]+(\d+)/.exec(cellPart)
  if (!match) return null
  const row = Number(match[1])
  return Number.isFinite(row) ? row : null
}
