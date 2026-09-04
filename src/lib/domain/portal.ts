/**
 * 業務システムポータルのドメインロジック。
 *
 * ここには DB も Next.js も持ち込まない純粋な関数だけを置く。
 * 「どのURLなら安全に開かせてよいか」「カードをどう並べるか」といった
 * 判断はテストで固定しておきたいため。
 */

/** 管理画面のアイコン選択で最初に出す候補。ここに無い絵文字も自由に入力できる */
export const ICON_SUGGESTIONS = [
  '🔔', '👥', '📊', '🎯', '📱', '🏠', '💰', '📝',
  '📅', '🤖', '🧾', '🔑', '📁', '📈', '🛠️', '💬',
  '🗂️', '🚀', '⭐', '🔗',
] as const

export const DEFAULT_ICON = '🔗'

/**
 * カードの色。Tailwind は文字列連結したクラス名を抽出できないため、
 * 完全なクラス名を対応表として持つ。
 */
export const ACCENTS = {
  slate: { label: 'グレー', tile: 'bg-slate-100 text-slate-700', ring: 'hover:border-slate-400', dot: 'bg-slate-400' },
  blue: { label: 'ブルー', tile: 'bg-blue-100 text-blue-700', ring: 'hover:border-blue-400', dot: 'bg-blue-500' },
  sky: { label: 'スカイ', tile: 'bg-sky-100 text-sky-700', ring: 'hover:border-sky-400', dot: 'bg-sky-500' },
  emerald: { label: 'グリーン', tile: 'bg-emerald-100 text-emerald-700', ring: 'hover:border-emerald-400', dot: 'bg-emerald-500' },
  amber: { label: 'イエロー', tile: 'bg-amber-100 text-amber-700', ring: 'hover:border-amber-400', dot: 'bg-amber-500' },
  rose: { label: 'レッド', tile: 'bg-rose-100 text-rose-700', ring: 'hover:border-rose-400', dot: 'bg-rose-500' },
  violet: { label: 'パープル', tile: 'bg-violet-100 text-violet-700', ring: 'hover:border-violet-400', dot: 'bg-violet-500' },
  indigo: { label: 'インディゴ', tile: 'bg-indigo-100 text-indigo-700', ring: 'hover:border-indigo-400', dot: 'bg-indigo-500' },
} as const

export type AccentKey = keyof typeof ACCENTS
export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[]
export const DEFAULT_ACCENT: AccentKey = 'slate'

export function accentOf(key: string): (typeof ACCENTS)[AccentKey] {
  return ACCENTS[key as AccentKey] ?? ACCENTS[DEFAULT_ACCENT]
}

/** 権限。数値が大きいほど強い */
export const ROLE_RANK = { STAFF: 1, MANAGER: 2, ADMIN: 3 } as const
export type PortalRole = keyof typeof ROLE_RANK

export const ROLE_LABEL: Record<PortalRole, string> = {
  STAFF: '全員',
  MANAGER: '責任者以上',
  ADMIN: '管理者のみ',
}

/** そのロールでこのシステムを開いてよいか */
export function canAccess(role: PortalRole, minRole: PortalRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/**
 * 遷移先URLの検証。
 *
 * 許可するのは次の2種類だけ。
 *   - http(s) の絶対URL（例: https://example.com/remind）
 *   - このサイト内のパス（例: /customers）
 *
 * `javascript:` や `data:` を管理画面から登録できてしまうと、
 * 管理者を踏み台にした攻撃の入口になるため、明示的に弾く。
 * 戻り値は保存してよい形に整えた文字列。不正なら null。
 */
export function normalizeSystemUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  // サイト内パス。`//host` はプロトコル相対URL（＝外部）なので除外する
  if (value.startsWith('/')) {
    return value.startsWith('//') ? null : value
  }

  // スキーム無しで「example.com/...」と書かれたら https:// を補う
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (!parsed.hostname) return null
  return parsed.toString()
}

/** 同一サイト内へのリンクか（別タブ既定値の判断とラベル表示に使う） */
export function isInternalUrl(url: string): boolean {
  return url.startsWith('/')
}

/** カードに小さく出す遷移先の表記。長いURLは出さず、どこへ行くかだけ伝える */
export function displayHost(url: string): string {
  // トップ（/）に「このサイト内 /」と出すと余計な記号が目に入るだけなので省く
  if (isInternalUrl(url)) return url === '/' ? 'このサイト内' : `このサイト内 ${url}`
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 表示名。空文字を保存させないための最終防衛 */
export function normalizeName(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ')
  if (!value || value.length > 40) return null
  return value
}

/**
 * アイコン。絵文字1〜2文字を想定。
 * 長い文字列を入れられるとカードのレイアウトが崩れるので上限を設ける。
 */
export function normalizeIcon(raw: string | null | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_ICON
  // 絵文字は複数のコードポイントで1文字を構成するため、書記素ではなく長さで抑える
  return Array.from(value).slice(0, 4).join('')
}

export function normalizeAccent(raw: string | null | undefined): AccentKey {
  return ACCENT_KEYS.includes(raw as AccentKey) ? (raw as AccentKey) : DEFAULT_ACCENT
}

/** 末尾に追加するときの表示順。既存の最大値 + 10（間に差し込む余地を残す） */
export function nextSortOrder(existing: number[]): number {
  if (existing.length === 0) return 0
  return Math.max(...existing) + 10
}

/**
 * 「1つ上へ」「1つ下へ」を押したときの並び。
 * 表示順の数値を直接いじらせると穴あきや重複で分かりにくくなるため、
 * 配列を入れ替えてから 0,10,20... で振り直す方式にしている。
 */
export function moveInOrder<T>(items: T[], index: number, direction: 'up' | 'down'): T[] {
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const next = [...items]
  const a = next[index] as T
  const b = next[target] as T
  next[index] = b
  next[target] = a
  return next
}

/** 並び替え後に振り直す表示順 */
export function assignSortOrders(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i * 10)
}
