import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { normalizeBusinessHours } from '@/lib/domain/businessHours'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { rescheduleAllAwaiting } from '@/lib/services/conversation'
import { SETTINGS_ID } from '@/lib/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const dayHours = z.object({
  enabled: z.boolean(),
  open: z.string().regex(/^\d{1,2}:\d{2}$/),
  close: z.string().regex(/^\d{1,2}:\d{2}$/),
})

const schema = z.object({
  timezone: z.string().min(1).optional(),
  defaultReminderIntervalMinutes: z.number().int().min(0).max(10080).optional(),
  firstReminderDelayMinutes: z.number().int().min(1).max(10080).optional(),
  maxRemindersPerCycle: z.number().int().min(0).max(100).optional(),
  businessHours: z
    .object({
      sun: dayHours,
      mon: dayHours,
      tue: dayHours,
      wed: dayHours,
      thu: dayHours,
      fri: dayHours,
      sat: dayHours,
    })
    .optional(),
  respectBusinessHours: z.boolean().optional(),
  openOnPublicHolidays: z.boolean().optional(),
  countBusinessHoursOnly: z.boolean().optional(),
  maxSilenceGuardMinutes: z.number().int().min(0).max(10080).optional(),
  watchdogDelayMinutes: z.number().int().min(5).max(1440).optional(),
  alwaysNotifyDefaultGroup: z.boolean().optional(),
  digestRepeatReminders: z.boolean().optional(),
  includeMessageBodyInNotification: z.boolean().optional(),
  messageExcerptLength: z.number().int().min(10).max(500).optional(),
  dataRetentionMonths: z.number().int().min(0).max(120).optional(),
})

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('MANAGER')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('設定値が不正です', 400, { issues: parsed.error.issues })

    const data = { ...parsed.data } as Record<string, unknown>
    if (parsed.data.businessHours) {
      data.businessHours = normalizeBusinessHours(parsed.data.businessHours) as unknown as Prisma.InputJsonValue
    }
    if (parsed.data.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timezone })
      } catch {
        return jsonError('タイムゾーンの指定が不正です', 400)
      }
    }

    const settings = await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        ...data,
        businessHours: normalizeBusinessHours(parsed.data.businessHours) as unknown as Prisma.InputJsonValue,
      },
      update: data,
    })

    // 設定変更を既存の未返信案件へ即時反映する
    const ctx = await loadPolicyContext()
    const rescheduled = await rescheduleAllAwaiting(ctx)

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'settings.update',
        targetType: 'settings',
        targetId: String(SETTINGS_ID),
        detail: data as object,
      },
    })

    return NextResponse.json({ ok: true, settings, rescheduled })
  } catch (e) {
    return handleApiError(e)
  }
}
