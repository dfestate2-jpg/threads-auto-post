/**
 * 宛先の正規化。
 *
 * 「配信停止したのに別表記で再登録されて、また届いてしまう」事故を防ぐため、
 * 保存・照合はすべてこの関数を通した値で行う。
 */

/** RFC を厳密に実装はしない。実務上通るものだけを通す */
const EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(\.[^\s@,;<>"'.]+)+$/

/** 小文字化・前後空白除去。不正な形式なら null */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null
  // 全角文字で入力されることがあるため半角へ寄せる
  const half = input.normalize('NFKC').trim().replace(/^[<]|[>]$/g, '')
  if (half.length === 0 || half.length > 254) return null
  const lower = half.toLowerCase()
  return EMAIL_RE.test(lower) ? lower : null
}

/**
 * 電話番号を国内向けに正規化する（SMS配信で使う）。
 * 090-1234-5678 / +81 90 1234 5678 → 09012345678
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = input.normalize('NFKC').replace(/[^\d+]/g, '')
  const local = digits.startsWith('+81') ? `0${digits.slice(3)}` : digits.startsWith('81') && digits.length >= 12 ? `0${digits.slice(2)}` : digits
  if (!/^0\d{9,10}$/.test(local)) return null
  return local
}

/** ヘッダインジェクション対策。件名や表示名に改行を混ぜられないようにする */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
