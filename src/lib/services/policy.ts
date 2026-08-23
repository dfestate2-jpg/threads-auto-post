import type { AppSettings } from '@prisma/client'

import type { BusinessCalendar } from '@/lib/domain/businessHours'
import { resolveIntervalMinutes, type SchedulePolicy } from '@/lib/domain/reminderSchedule'

export interface PolicyContext {
  settings: AppSettings
  calendar: BusinessCalendar
  /** 有効なエスカレーション閾値（分・昇順） */
  escalationThresholdsMinutes: number[]
}

/** 顧客個別の上書き設定を反映したスケジュールポリシーを作る */
export function buildPolicy(ctx: PolicyContext, customerIntervalOverride: number | null | undefined): SchedulePolicy {
  const { settings, calendar } = ctx
  return {
    intervalMinutes: resolveIntervalMinutes(customerIntervalOverride, settings.defaultReminderIntervalMinutes),
    firstDelayMinutes: settings.firstReminderDelayMinutes,
    maxRemindersPerCycle: settings.maxRemindersPerCycle,
    maxSilenceGuardMinutes: settings.maxSilenceGuardMinutes,
    respectBusinessHours: settings.respectBusinessHours,
    countBusinessHoursOnly: settings.countBusinessHoursOnly,
    calendar,
    escalationThresholdsMinutes: ctx.escalationThresholdsMinutes,
  }
}

/** 管理画面のプルダウンに出す通知間隔の選択肢【仕様：通知の工夫】 */
export const REMINDER_INTERVAL_OPTIONS = [
  { value: 60, label: '1時間ごと' },
  { value: 120, label: '2時間ごと' },
  { value: 180, label: '3時間ごと' },
  { value: 0, label: '通知しない' },
] as const
