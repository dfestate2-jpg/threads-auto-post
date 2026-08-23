import { buildCalendar, DEFAULT_BUSINESS_HOURS, type BusinessCalendar } from '@/lib/domain/businessHours'
import type { SchedulePolicy } from '@/lib/domain/reminderSchedule'

export const TZ = 'Asia/Tokyo'

/** JST の壁時計から UTC の Date を作る */
export function jst(iso: string): Date {
  return new Date(`${iso}+09:00`)
}

export function calendar(overrides: Partial<Parameters<typeof buildCalendar>[0]> = {}): BusinessCalendar {
  return buildCalendar({
    timezone: TZ,
    hours: DEFAULT_BUSINESS_HOURS, // 月〜土 9:00-20:00 / 日曜休
    openOnPublicHolidays: false,
    holidays: [],
    ...overrides,
  })
}

export function policy(overrides: Partial<SchedulePolicy> = {}): SchedulePolicy {
  return {
    intervalMinutes: 60,
    firstDelayMinutes: 60,
    maxRemindersPerCycle: 0,
    maxSilenceGuardMinutes: 180,
    respectBusinessHours: false,
    countBusinessHoursOnly: false,
    calendar: calendar(),
    ...overrides,
  }
}
