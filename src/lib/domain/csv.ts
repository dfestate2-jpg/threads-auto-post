/**
 * CSV の解析と、日本語ヘッダーの列マッピング。
 *
 * 現場のリストは Excel / Google スプレッドシート / 各種フォームツールから出てくるため、
 * 「列名が揺れていても読める」ことを優先する。読めなかった行は捨てずに理由付きで返し、
 * 取り込み結果画面で担当者が確認できるようにする。
 */
import { ConsentStatus, ContactSource, PropertyType } from '@prisma/client'

/** RFC4180 準拠のパーサ。引用符内の改行・カンマ・二重引用符に対応する */
export function parseCsv(input: string): string[][] {
  // BOM と CRLF を先に正規化しておく（Excel 由来の CSV は両方付いてくる）
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === ',' || c === '\t') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  row.push(field)
  rows.push(row)

  // 完全な空行は落とす
  return rows.filter((r) => r.some((v) => v.trim().length > 0))
}

/** 認識できる列。ヘッダー名の表記揺れを吸収する */
export type ContactColumn =
  | 'email'
  | 'name'
  | 'kana'
  | 'phone'
  | 'areas'
  | 'budgetMin'
  | 'budgetMax'
  | 'propertyTypes'
  | 'consent'
  | 'consentAt'
  | 'note'

const HEADER_ALIASES: Record<ContactColumn, string[]> = {
  email: ['email', 'mail', 'mailaddress', 'emailaddress', 'メール', 'メールアドレス', 'メアド', 'eメール', '電子メール'],
  name: ['name', 'fullname', '名前', '氏名', 'お名前', '顧客名', 'お客様名'],
  kana: ['kana', 'furigana', 'カナ', 'フリガナ', 'ふりがな', '氏名カナ'],
  phone: ['phone', 'tel', 'telephone', 'mobile', '電話', '電話番号', '携帯', '携帯番号', 'tel番号'],
  areas: ['area', 'areas', 'エリア', '希望エリア', '希望地域', '地域', '希望エリア（複数可）'],
  budgetMin: ['budgetmin', 'minbudget', '予算下限', '最低予算', '予算min'],
  budgetMax: ['budgetmax', 'maxbudget', '予算', '予算上限', '予算max', 'ご予算'],
  propertyTypes: ['type', 'types', 'propertytype', '種別', '物件種別', '希望種別'],
  consent: ['consent', 'optin', '同意', '配信同意', 'メール配信同意', 'dm同意'],
  consentAt: ['consentat', 'date', 'timestamp', '登録日', '登録日時', '回答日時', 'タイムスタンプ', '申込日'],
  note: ['note', 'memo', '備考', 'メモ', '取得経路', '流入経路'],
}

function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()（）[\]【】]/g, '')
}

/** ヘッダー行から「列番号 → 意味」の対応を作る。未知の列は無視する */
export function mapHeaders(header: string[]): Partial<Record<ContactColumn, number>> {
  const map: Partial<Record<ContactColumn, number>> = {}
  header.forEach((raw, index) => {
    const key = normalizeHeader(raw)
    if (!key) return
    for (const [column, aliases] of Object.entries(HEADER_ALIASES) as [ContactColumn, string[]][]) {
      if (map[column] !== undefined) continue
      if (aliases.some((a) => a === key)) {
        map[column] = index
        return
      }
    }
  })
  return map
}

/** 「東京都/世田谷区、目黒区」のような入力を配列にする */
export function splitList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .normalize('NFKC')
    .split(/[,、/|・\n]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .slice(0, 20)
}

const TYPE_KEYWORDS: [PropertyType, RegExp][] = [
  ['MANSION', /マンション|区分|アパート|mansion|apartment|condo/i],
  ['HOUSE', /戸建|一戸建|新築|中古住宅|house/i],
  ['LAND', /土地|land/i],
  ['INVESTMENT', /投資|収益|一棟|利回り|investment/i],
]

export function parsePropertyTypes(value: string | undefined): PropertyType[] {
  const out = new Set<PropertyType>()
  for (const token of splitList(value)) {
    const hit = TYPE_KEYWORDS.find(([, re]) => re.test(token))
    out.add(hit ? hit[0] : PropertyType.OTHER)
  }
  return [...out]
}

/**
 * 予算を万円に正規化する。
 * 「5000万」「5,000万円」→ 5000 / 「1億」→ 10000 / 「50000000」→ 5000
 */
export function parseBudgetMan(value: string | undefined): number | null {
  if (!value) return null
  const s = value.normalize('NFKC').replace(/[,\s]/g, '')
  if (s.length === 0) return null

  const okuMatch = s.match(/^(\d+(?:\.\d+)?)億(?:(\d+(?:\.\d+)?)万?)?/)
  if (okuMatch?.[1]) {
    const oku = Number(okuMatch[1]) * 10000
    const man = okuMatch[2] ? Number(okuMatch[2]) : 0
    return Math.round(oku + man)
  }
  const manMatch = s.match(/^(\d+(?:\.\d+)?)万/)
  if (manMatch?.[1]) return Math.round(Number(manMatch[1]))

  const plain = s.match(/^(\d+(?:\.\d+)?)/)
  if (!plain?.[1]) return null
  const n = Number(plain[1])
  if (!Number.isFinite(n) || n <= 0) return null
  // 8桁以上は「円」で書かれているとみなして万円に落とす
  return n >= 1_000_000 ? Math.round(n / 10000) : Math.round(n)
}

/** 同意列の解釈。**曖昧な値は同意とみなさない**（送ってよい側に倒さない） */
export function parseConsent(value: string | undefined): ConsentStatus {
  if (!value) return ConsentStatus.UNKNOWN
  const s = value.normalize('NFKC').trim().toLowerCase()
  if (/^(拒否|停止|配信停止|解除|ng|no|false|0|unsubscribe)/.test(s)) return ConsentStatus.UNSUBSCRIBED
  if (/^(同意|希望|する|受け取る|ok|yes|true|1|y|承諾)/.test(s)) return ConsentStatus.OPTED_IN
  return ConsentStatus.UNKNOWN
}

export function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const s = value.normalize('NFKC').trim().replace(/[年月]/g, '/').replace(/日/, '')
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface ParsedContactRow {
  /** CSV 上の行番号（ヘッダーを1行目として数える。エラー表示用） */
  line: number
  email: string
  name: string | null
  kana: string | null
  phone: string | null
  areas: string[]
  budgetMin: number | null
  budgetMax: number | null
  propertyTypes: PropertyType[]
  consent: ConsentStatus
  consentAt: Date | null
  note: string | null
}

export interface RowError {
  line: number
  reason: string
  /** 値そのものは残さず、判断に必要な最小限だけを返す */
  column: ContactColumn | null
}

export interface ParseContactsResult {
  rows: ParsedContactRow[]
  errors: RowError[]
  /** ヘッダーで認識できた列 */
  detected: ContactColumn[]
}

/**
 * CSV 本文を取り込み可能な行に変換する。
 * メールアドレスが無い・不正な行はエラーとして返し、取り込まない。
 */
export function parseContactsCsv(
  input: string,
  normalizeEmail: (v: string | null | undefined) => string | null,
): ParseContactsResult {
  const table = parseCsv(input)
  const header = table[0]
  if (!header) return { rows: [], errors: [], detected: [] }

  const map = mapHeaders(header)
  const detected = Object.keys(map) as ContactColumn[]
  if (map.email === undefined) {
    return {
      rows: [],
      errors: [{ line: 1, reason: 'メールアドレスの列が見つかりません（「メールアドレス」「email」等の見出しが必要です）', column: 'email' }],
      detected,
    }
  }

  const at = (row: string[], col: ContactColumn): string | undefined => {
    const i = map[col]
    if (i === undefined) return undefined
    const v = row[i]
    return v === undefined || v.trim().length === 0 ? undefined : v.trim()
  }

  const rows: ParsedContactRow[] = []
  const errors: RowError[] = []
  const seen = new Set<string>()

  for (let r = 1; r < table.length; r++) {
    const line = r + 1
    const raw = table[r] ?? []
    const email = normalizeEmail(at(raw, 'email'))
    if (!email) {
      errors.push({ line, reason: 'メールアドレスが空、または形式が不正です', column: 'email' })
      continue
    }
    if (seen.has(email)) {
      errors.push({ line, reason: 'ファイル内で重複している行のため取り込みません', column: 'email' })
      continue
    }
    seen.add(email)

    rows.push({
      line,
      email,
      name: at(raw, 'name') ?? null,
      kana: at(raw, 'kana') ?? null,
      phone: at(raw, 'phone') ?? null,
      areas: splitList(at(raw, 'areas')),
      budgetMin: parseBudgetMan(at(raw, 'budgetMin')),
      budgetMax: parseBudgetMan(at(raw, 'budgetMax')),
      propertyTypes: parsePropertyTypes(at(raw, 'propertyTypes')),
      consent: parseConsent(at(raw, 'consent')),
      consentAt: parseDate(at(raw, 'consentAt')),
      note: at(raw, 'note') ?? null,
    })
  }

  return { rows, errors, detected }
}

/** 取り込み元の既定値。フォーム経由と分かっている場合は LINE_FORM を指定する */
export const DEFAULT_IMPORT_SOURCE = ContactSource.IMPORT
