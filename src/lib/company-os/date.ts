/**
 * 日付まわり。
 *
 * 期限は「日付」で扱う（時刻を持たない）。サーバーの時刻がUTCでも
 * 経営者の見ている「今日」とずれないよう、判定はすべてタイムゾーンつきで行う。
 */

export const DEFAULT_TIMEZONE = 'Asia/Tokyo'

/** その瞬間を、指定タイムゾーンでの YYYY-MM-DD にする */
export function toDateKey(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return parts
}

/** YYYY-MM-DD を、その日の 00:00 UTC を指す Date にする（@db.Date 列と同じ持ち方） */
export function fromDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const time = Date.parse(`${key}T00:00:00.000Z`)
  if (Number.isNaN(time)) return null
  return new Date(time)
}

/** 入力欄（YYYY-MM-DD）からの値を Date に。空文字は「未設定」として null */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return fromDateKey(trimmed)
}

/** @db.Date の値を <input type="date"> に戻す */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return ''
  return toDateKey(date, 'UTC')
}

/** 日付の差（日数）。b - a。時刻は見ない */
export function diffDays(a: string, b: string): number {
  const from = fromDateKey(a)
  const to = fromDateKey(b)
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * 期限までの残り日数。
 * 負なら超過、0 なら今日が期限、null なら期限なし。
 */
export function daysUntilDue(dueOn: Date | null | undefined, now: Date, timezone: string = DEFAULT_TIMEZONE): number | null {
  if (!dueOn) return null
  return diffDays(toDateKey(now, timezone), toDateKey(dueOn, 'UTC'))
}

/** YYYY-MM-DD に日数を足す */
export function addDaysToKey(key: string, days: number): string {
  const base = fromDateKey(key)
  if (!base) return key
  return toDateKey(new Date(base.getTime() + days * 86_400_000), 'UTC')
}

/** 「今日」「明日」「3日後」「2日超過」のような人間向けの表現 */
export function formatDueLabel(dueOn: Date | null | undefined, now: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const days = daysUntilDue(dueOn, now, timezone)
  if (days === null) return '期限なし'
  if (days === 0) return '今日'
  if (days === 1) return '明日'
  if (days === -1) return '1日超過'
  if (days < 0) return `${-days}日超過`
  return `${days}日後`
}

/** 一覧に出す短い日付。例: 9/8 */
export function formatShortDate(date: Date | null | undefined): string {
  if (!date) return '—'
  const key = toDateKey(date, 'UTC')
  const [, month, day] = key.split('-')
  if (!month || !day) return '—'
  return `${Number(month)}/${Number(day)}`
}

/** 会議などの日時表示 */
export function formatDateTime(date: Date | null | undefined, timezone: string = DEFAULT_TIMEZONE): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** 今日 / 今週（今日から6日先まで）/ 期限超過 の判定に使う境界日 */
export interface DateWindow {
  today: string
  weekEnd: string
}

export function dateWindow(now: Date, timezone: string = DEFAULT_TIMEZONE): DateWindow {
  const today = toDateKey(now, timezone)
  return { today, weekEnd: addDaysToKey(today, 6) }
}

/** <input type="datetime-local"> に戻す（表示タイムゾーン基準） */
export function toDateTimeInput(date: Date | null | undefined, timezone: string = DEFAULT_TIMEZONE): string {
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
}
