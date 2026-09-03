/**
 * 担当者のLINEユーザーIDを本人操作で紐づけるための使い捨てコード。
 *
 * LINEユーザーIDは `U` + 32桁の英数字で、管理画面へ手で書き写すと確実に打ち間違える。
 * 間違ったIDを登録すると **通知が別人に飛ぶか、誰にも届かない**——どちらも見逃しに直結する。
 * そこで「管理画面でコードを発行 → 本人が社内通知Botへ送る」で自動的に紐づける。
 */
import { createHash, randomInt } from 'node:crypto'

/** 読み違えやすい I / L / O / 0 / 1 を除いた英数字 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const LINK_CODE_LENGTH = 8
/** 8文字 × 31種 ≒ 8.5×10^11 通り。有効期限と使い捨てと併せて総当たりは成立しない */
export const LINK_CODE_TTL_MINUTES = 24 * 60

export function generateLinkCode(pick: (max: number) => number = (max) => randomInt(max)): string {
  let out = ''
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) out += ALPHABET[pick(ALPHABET.length)]
  return out
}

/** 表示用に4文字ずつ区切る（口頭やチャットで伝えるときの読み違いを減らす） */
export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** 照合はハッシュで行う。DBに平文を残さない */
export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/**
 * LINEに送られてきた本文からコードを取り出す。
 *
 * 「ABCD-2345」「登録 ABCD2345」「コード：abcd2345」など、
 * 人が実際に送ってくる形をひととおり受け付ける。見つからなければ null。
 */
export function extractLinkCode(text: string | null | undefined): string | null {
  if (!text) return null
  const candidates = text
    .toUpperCase()
    .replace(/[-−ー–—\s]/g, '')
    .split(/[^0-9A-Z]+/)
    .filter((t) => t.length > 0)

  for (const token of candidates) {
    if (token.length !== LINK_CODE_LENGTH) continue
    if ([...token].every((c) => ALPHABET.includes(c))) return token
  }
  return null
}
