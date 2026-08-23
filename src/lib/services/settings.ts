import type { AppSettings, BusinessHoliday, Prisma } from '@prisma/client'

import { buildCalendar, DEFAULT_BUSINESS_HOURS, type BusinessCalendar } from '@/lib/domain/businessHours'
import { prisma } from '@/lib/prisma'

export const SETTINGS_ID = 1

/** 設定行が無ければ既定値で作成して返す */
export async function getSettings(): Promise<AppSettings> {
  const existing = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } })
  if (existing) return existing
  return prisma.appSettings.create({
    data: { id: SETTINGS_ID, businessHours: DEFAULT_BUSINESS_HOURS as unknown as Prisma.InputJsonValue },
  })
}

/**
 * 営業カレンダーを構築する。
 * 祝日テーブルは前後1年分だけ読み込めば十分（リマインドの繰り延べは最大でも数日）。
 */
export async function getCalendar(settings: AppSettings, now = new Date()): Promise<BusinessCalendar> {
  const from = new Date(now.getTime() - 90 * 86_400_000)
  const to = new Date(now.getTime() + 365 * 86_400_000)
  const holidays: BusinessHoliday[] = await prisma.businessHoliday.findMany({
    where: { date: { gte: from, lte: to } },
  })
  return buildCalendar({
    timezone: settings.timezone,
    hours: settings.businessHours,
    openOnPublicHolidays: settings.openOnPublicHolidays,
    holidays: holidays.map((h) => ({
      // @db.Date は UTC 00:00 の Date として返るため、そのまま日付部分を使う
      dateKey: h.date.toISOString().slice(0, 10),
      isOpen: h.isOpen,
    })),
  })
}
