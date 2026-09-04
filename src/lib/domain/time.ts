import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type DayKey = (typeof DAY_KEYS)[number]

export const MINUTE_MS = 60_000

/** タイムゾーン基準の暦日キー（yyyy-MM-dd）を返す */
export function dateKeyOf(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd')
}

/** タイムゾーン基準のその日の経過分（0-1439）を返す */
export function minutesOfDay(instant: Date, timezone: string): number {
  const hh = Number(formatInTimeZone(instant, timezone, 'HH'))
  const mm = Number(formatInTimeZone(instant, timezone, 'mm'))
  return hh * 60 + mm
}

/** 暦日キーを n 日ずらす（純粋な暦計算。タイムゾーンに依存しない） */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** 暦日キーの曜日を返す */
export function dayKeyOfDate(dateKey: string): DayKey {
  const [y, m, d] = dateKey.split('-').map(Number)
  const idx = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  return DAY_KEYS[idx] as DayKey
}

/** "HH:mm" を分に変換。不正値は null */
export function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59) return null
  return h * 60 + min
}

export function formatHhMm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 「その暦日の 00:00 から n 分後」の実時刻を返す。
 * n は 1440 を超えてもよい（翌日にまたがる営業時間の表現に使う）。
 */
export function instantAtDayMinutes(dateKey: string, dayMinutes: number, timezone: string): Date {
  const dayOffset = Math.floor(dayMinutes / 1440)
  const rest = dayMinutes - dayOffset * 1440
  const target = shiftDateKey(dateKey, dayOffset)
  return fromZonedTime(`${target}T${formatHhMm(rest)}:00`, timezone)
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS)
}

export function diffMinutes(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MINUTE_MS)
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

/**
 * 未返信経過分を日本語の可読表現にする。
 * 例: 45 -> "45分" / 120 -> "2時間" / 90 -> "1時間30分" / 1560 -> "1日2時間"
 */
export function formatElapsedJa(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes))
  if (m < 60) return `${m}分`
  const days = Math.floor(m / 1440)
  const hours = Math.floor((m % 1440) / 60)
  const mins = m % 60
  if (days > 0) return hours > 0 ? `${days}日${hours}時間` : `${days}日`
  return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`
}

/** タイムゾーン基準の「その日の 00:00」 */
export function startOfDayIn(timezone: string, instant: Date): Date {
  return instantAtDayMinutes(dateKeyOf(instant, timezone), 0, timezone)
}

/** タイムゾーン基準の「その日の 23:59:59.999」 */
export function endOfDayIn(timezone: string, instant: Date): Date {
  return new Date(instantAtDayMinutes(dateKeyOf(instant, timezone), 1440, timezone).getTime() - 1)
}

/** 「8/31（月）」のような短い日付表現 */
export function formatShortDateJa(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(instant)
}
