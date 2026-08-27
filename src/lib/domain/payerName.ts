/**
 * 銀行明細の「摘要」から **入金者名（振込人名義）** を取り出して整える。
 *
 * 銀行から届く摘要は、半角カナ・取引種別の接頭辞・法人格の略号が混ざった生の文字列。
 *
 *   "ﾌﾘｺﾐ ｶ)ﾀﾏﾎｰﾑ"     →  "タマホーム"
 *   "振込 ｸﾗﾊｼ ｼﾞﾕﾝﾔ"   →  "クラハシ ジユンヤ"
 *
 * 既存スプレッドシートの「入金者」欄は、銀行の振込人名義をカタカナのまま
 * （法人格の略号だけ落として）記録する運用になっている。既存行と見た目を
 * そろえるため、既定では **展開せず削除する**（"カ)タマホーム" → "タマホーム"）。
 *
 * 副作用のない純関数にしてあるため、期待値をテストで固定できる。
 * → tests/payerName.test.ts
 */

/** 全銀システムで使われる法人格の略号 → 正式名称 */
const CORPORATE_ABBREVIATIONS: ReadonlyArray<readonly [string, string]> = [
  ['トクヒ', '特定非営利活動法人'],
  ['シユウ', '宗教法人'],
  ['シュウ', '宗教法人'],
  ['ザイ', '財団法人'],
  ['シヤ', '社団法人'],
  ['シャ', '社団法人'],
  ['ガク', '学校法人'],
  ['ノウ', '農業協同組合'],
  ['ギヨ', '漁業協同組合'],
  ['カ', '株式会社'],
  ['ユ', '有限会社'],
  ['ド', '合同会社'],
  ['シ', '合資会社'],
  ['メ', '合名会社'],
  ['イ', '医療法人'],
]

/**
 * 摘要の先頭に付く取引種別。入金者名ではないので落とす。
 * 「振込」で始まる名義はまず無いため、**先頭に限って**削る。
 */
const LEADING_NOISE = [
  '振込入金',
  '振替入金',
  '他行振込',
  '総合振込',
  '給与振込',
  '口座振替',
  '定額入金',
  '振込',
  '振替',
  '入金',
  'ソウゴウフリコミ',
  'フリコミ',
  'フリカエ',
  'キユウヨ',
  'キュウヨ',
  'ATM',
  'カード',
  'デビット',
  'ネット',
] as const

/** 末尾に付きがちな取扱情報。入金者名ではないので落とす */
const TRAILING_NOISE = ['ATM', 'カード', 'ネット'] as const

/** 法人格の略号の扱い */
export type CorporateMode =
  | 'strip' /// "カ)タマホーム" → "タマホーム"（既定。既存シートの運用に合わせる）
  | 'expand' /// "カ)タマホーム" → "株式会社タマホーム"
  | 'keep' /// そのまま

export interface PayerNameOptions {
  corporate?: CorporateMode
}

/** 半角カナ・全角英数などの表記ゆれを吸収し、空白を1つに詰める */
export function canonicalize(value: string): string {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[　\s]+/g, ' ')
    .trim()
}

function stripLeadingNoise(value: string): string {
  let s = value
  for (let guard = 0; guard < 5; guard += 1) {
    const before = s
    for (const token of LEADING_NOISE) {
      const re = new RegExp(`^[(\\[【]?${token}[)\\]】]?[\\s:：\\-ー–—・,、/]*`)
      if (re.test(s)) {
        s = s.replace(re, '').trim()
        break
      }
    }
    if (s === before) break
  }
  return s
}

function stripTrailingNoise(value: string): string {
  let s = value
  for (let guard = 0; guard < 5; guard += 1) {
    const before = s
    for (const token of TRAILING_NOISE) {
      const re = new RegExp(`[\\s:：\\-ー–—・,、/]+[(\\[【]?${token}[)\\]】]?$`)
      if (re.test(s) && s.replace(re, '').trim().length > 0) {
        s = s.replace(re, '').trim()
        break
      }
    }
    if (s === before) break
  }
  return s
}

/**
 * "カ)タマホーム"（前株）/ "タマホーム(カ"（後株）の法人格略号を処理する。
 * 略号に一致しないときは何もしない（誤変換しないことを優先する）。
 */
function applyCorporateMode(value: string, mode: CorporateMode): string {
  if (mode === 'keep') return value

  for (const [abbr, full] of CORPORATE_ABBREVIATIONS) {
    const leading = new RegExp(`^${abbr}\\)\\s*(.+)$`)
    const leadingMatch = leading.exec(value)
    if (leadingMatch) {
      const rest = leadingMatch[1]?.trim() ?? ''
      return mode === 'expand' ? `${full}${rest}` : rest
    }

    const trailing = new RegExp(`^(.+?)\\s*\\(${abbr}\\)?$`)
    const trailingMatch = trailing.exec(value)
    if (trailingMatch) {
      const rest = trailingMatch[1]?.trim() ?? ''
      return mode === 'expand' ? `${rest}${full}` : rest
    }
  }
  return value
}

/**
 * 摘要から入金者名を抽出する。
 *
 * 抽出できないときは **空文字ではなく元の摘要をそのまま返す**。
 * 名前欄が空のままシートに積まれるより、生の摘要が入っているほうが運用で困らない。
 */
export function extractPayerName(description: string, options: PayerNameOptions = {}): string {
  const mode = options.corporate ?? 'strip'

  const canonical = canonicalize(description)
  if (canonical.length === 0) return ''

  let s = stripLeadingNoise(canonical)
  s = stripTrailingNoise(s)
  // 摘要が「振込」だけだった等、削り切って空になった場合は元に戻す
  if (s.length === 0) s = canonical

  s = applyCorporateMode(s, mode)

  return s.trim().length > 0 ? s.trim() : canonical
}

/**
 * 突合（重複判定）用に名前を丸める。
 * シート側は人が編集していることがあるため、空白と大小文字の差は無視する。
 */
export function payerNameKey(name: string): string {
  return canonicalize(name).replace(/\s+/g, '').toLowerCase()
}
