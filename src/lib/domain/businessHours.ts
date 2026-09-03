import {
  DAY_KEYS,
  type DayKey,
  dateKeyOf,
  dayKeyOfDate,
  instantAtDayMinutes,
  parseHhMm,
  shiftDateKey,
} from './time'

export interface DayHours {
  enabled: boolean
  /** "HH:mm" */
  open: string
  /** "HH:mm"。open 以下の場合は翌日にまたがる営業時間として扱う */
  close: string
}

export type BusinessHours = Record<DayKey, DayHours>

export interface HolidayEntry {
  /** yyyy-MM-dd */
  dateKey: string
  /**
   * false: 休業日（祝日・臨時休業）
   * true : 臨時営業日（曜日設定が無効でもこの日は営業する）
   */
  isOpen: boolean
}

export interface BusinessCalendar {
  timezone: string
  hours: BusinessHours
  /** 祝日（isOpen=false の登録日）も営業するか */
  openOnPublicHolidays: boolean
  /** dateKey -> isOpen */
  holidays: Map<string, boolean>
}

export interface OpenWindow {
  start: Date
  end: Date
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  sun: { enabled: false, open: '09:00', close: '20:00' },
  mon: { enabled: true, open: '09:00', close: '20:00' },
  tue: { enabled: true, open: '09:00', close: '20:00' },
  wed: { enabled: true, open: '09:00', close: '20:00' },
  thu: { enabled: true, open: '09:00', close: '20:00' },
  fri: { enabled: true, open: '09:00', close: '20:00' },
  sat: { enabled: true, open: '09:00', close: '20:00' },
}

/** 未知の形の JSON を安全に BusinessHours へ正規化する */
export function normalizeBusinessHours(input: unknown): BusinessHours {
  const source = (input ?? {}) as Partial<Record<DayKey, Partial<DayHours>>>
  const out = {} as BusinessHours
  for (const day of DAY_KEYS) {
    const fallback = DEFAULT_BUSINESS_HOURS[day]
    const raw = source[day] ?? {}
    const open = typeof raw.open === 'string' && parseHhMm(raw.open) !== null ? raw.open : fallback.open
    const close = typeof raw.close === 'string' && parseHhMm(raw.close) !== null ? raw.close : fallback.close
    out[day] = {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
      open,
      close,
    }
  }
  return out
}

export function buildCalendar(params: {
  timezone: string
  hours: unknown
  openOnPublicHolidays: boolean
  holidays: HolidayEntry[]
}): BusinessCalendar {
  return {
    timezone: params.timezone,
    hours: normalizeBusinessHours(params.hours),
    openOnPublicHolidays: params.openOnPublicHolidays,
    holidays: new Map(params.holidays.map((h) => [h.dateKey, h.isOpen])),
  }
}

/** 曜日設定が全て無効なら「常に閉まっている」= 判定不能とみなす */
function hasAnyEnabledDay(cal: BusinessCalendar): boolean {
  return DAY_KEYS.some((d) => cal.hours[d].enabled)
}

/** 臨時営業日で曜日設定が無効なときに使う代替の営業時間 */
function fallbackHours(cal: BusinessCalendar): DayHours | null {
  for (const d of DAY_KEYS) {
    if (cal.hours[d].enabled) return cal.hours[d]
  }
  return null
}

/**
 * その暦日の営業時間帯を返す。営業しない日は null。
 * close <= open の場合は翌日にまたがる時間帯として扱う（例 22:00-02:00）。
 */
export function openWindowFor(dateKey: string, cal: BusinessCalendar): OpenWindow | null {
  const holidayIsOpen = cal.holidays.get(dateKey)
  const dayKey = dayKeyOfDate(dateKey)
  let hours = cal.hours[dayKey]

  if (holidayIsOpen === true) {
    // 臨時営業日：曜日設定が無効でも営業する
    if (!hours.enabled) {
      const fb = fallbackHours(cal)
      if (!fb) return null
      hours = fb
    }
  } else if (holidayIsOpen === false) {
    // 休業日として登録されている。「祝日も営業する」設定なら通常の曜日判定に戻す
    if (!cal.openOnPublicHolidays) return null
    if (!hours.enabled) return null
  } else if (!hours.enabled) {
    return null
  }

  const openMin = parseHhMm(hours.open)
  const closeMin = parseHhMm(hours.close)
  if (openMin === null || closeMin === null) return null

  const endMin = closeMin > openMin ? closeMin : closeMin + 1440
  if (endMin === openMin) return null

  return {
    start: instantAtDayMinutes(dateKey, openMin, cal.timezone),
    end: instantAtDayMinutes(dateKey, endMin, cal.timezone),
  }
}

/** その時刻が営業時間内か */
export function isWithinBusinessHours(instant: Date, cal: BusinessCalendar): boolean {
  const todayKey = dateKeyOf(instant, cal.timezone)
  for (const key of [shiftDateKey(todayKey, -1), todayKey]) {
    const w = openWindowFor(key, cal)
    if (w && instant >= w.start && instant < w.end) return true
  }
  return false
}

const MAX_SCAN_DAYS = 400

/**
 * instant 以降で最初に営業時間内となる時刻を返す。
 * すでに営業時間内なら instant をそのまま返す。
 *
 * 営業日が1日も見つからない場合は **instant をそのまま返す**（フェイルセーフ）。
 * 「営業時間の設定ミスで通知が永久に止まる」ほうが事故として重大なため、
 * 判定不能なら通知を止めない方針とする。
 */
export function nextBusinessInstant(instant: Date, cal: BusinessCalendar): Date {
  if (!hasAnyEnabledDay(cal)) return instant
  if (isWithinBusinessHours(instant, cal)) return instant

  let key = dateKeyOf(instant, cal.timezone)
  for (let i = 0; i < MAX_SCAN_DAYS; i += 1) {
    const w = openWindowFor(key, cal)
    if (w) {
      if (instant < w.start) return w.start
      if (instant < w.end) return instant
    }
    key = shiftDateKey(key, 1)
  }
  return instant
}

/**
 * 営業時間だけを数えて minutes 分進めた時刻を返す。
 * 営業日が見つからない場合は実時間で加算する（フェイルセーフ）。
 */
export function addBusinessMinutes(from: Date, minutes: number, cal: BusinessCalendar): Date {
  if (minutes <= 0) return nextBusinessInstant(from, cal)
  if (!hasAnyEnabledDay(cal)) return new Date(from.getTime() + minutes * 60_000)

  let remaining = minutes
  let cursor = nextBusinessInstant(from, cal)
  let key = shiftDateKey(dateKeyOf(cursor, cal.timezone), -1)

  for (let i = 0; i < MAX_SCAN_DAYS + 1; i += 1) {
    const w = openWindowFor(key, cal)
    key = shiftDateKey(key, 1)
    if (!w || w.end <= cursor) continue

    const segmentStart = cursor > w.start ? cursor : w.start
    const available = Math.floor((w.end.getTime() - segmentStart.getTime()) / 60_000)
    if (available >= remaining) {
      return new Date(segmentStart.getTime() + remaining * 60_000)
    }
    remaining -= available
    cursor = w.end
  }
  return new Date(from.getTime() + minutes * 60_000)
}

/** a から b までの営業時間内の分数 */
export function businessMinutesBetween(a: Date, b: Date, cal: BusinessCalendar): number {
  if (b <= a) return 0
  if (!hasAnyEnabledDay(cal)) return Math.floor((b.getTime() - a.getTime()) / 60_000)

  let total = 0
  let key = shiftDateKey(dateKeyOf(a, cal.timezone), -1)
  for (let i = 0; i < MAX_SCAN_DAYS + 2; i += 1) {
    const w = openWindowFor(key, cal)
    key = shiftDateKey(key, 1)
    if (!w) {
      if (instantAtDayMinutes(key, 0, cal.timezone) > b) break
      continue
    }
    const start = w.start > a ? w.start : a
    const end = w.end < b ? w.end : b
    if (end > start) total += Math.floor((end.getTime() - start.getTime()) / 60_000)
    if (w.start > b) break
  }
  return total
}
