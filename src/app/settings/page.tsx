import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { ChannelTable } from '@/components/settings/ChannelTable'
import { EscalationForm } from '@/components/settings/EscalationForm'
import { GeneralForm, type GeneralSettings } from '@/components/settings/GeneralForm'
import { HolidayTable } from '@/components/settings/HolidayTable'
import { RelayReceiptTable } from '@/components/settings/RelayReceiptTable'
import { StaffTable } from '@/components/settings/StaffTable'
import { requirePageSession } from '@/lib/auth/guard'
import { normalizeBusinessHours } from '@/lib/domain/businessHours'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { listRecentRelayReceipts } from '@/lib/services/relayReceipt'
import { getSettings } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requirePageSession()
  const settings = await getSettings()
  const [rules, staff, channels, holidays, receipts] = await Promise.all([
    prisma.escalationRule.findMany({ orderBy: { thresholdMinutes: 'asc' } }),
    prisma.staff.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.notificationChannel.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.businessHoliday.findMany({ orderBy: { date: 'asc' }, take: 200 }),
    listRecentRelayReceipts(8),
  ])

  const general: GeneralSettings = {
    timezone: settings.timezone,
    defaultReminderIntervalMinutes: settings.defaultReminderIntervalMinutes,
    firstReminderDelayMinutes: settings.firstReminderDelayMinutes,
    maxRemindersPerCycle: settings.maxRemindersPerCycle,
    businessHours: normalizeBusinessHours(settings.businessHours),
    respectBusinessHours: settings.respectBusinessHours,
    openOnPublicHolidays: settings.openOnPublicHolidays,
    countBusinessHoursOnly: settings.countBusinessHoursOnly,
    maxSilenceGuardMinutes: settings.maxSilenceGuardMinutes,
    watchdogDelayMinutes: settings.watchdogDelayMinutes,
    alwaysNotifyDefaultGroup: settings.alwaysNotifyDefaultGroup,
    digestRepeatReminders: settings.digestRepeatReminders,
    notificationTemplate: settings.notificationTemplate,
    includeMessageBodyInNotification: settings.includeMessageBodyInNotification,
    messageExcerptLength: settings.messageExcerptLength,
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">設定</h1>
        <Link href="/settings/followup" className="btn-secondary px-3 py-1.5 text-sm">
          追客ルール・LINEテンプレート
        </Link>
      </div>
      <div className="space-y-6">
        {/* 入口が動いているかは最優先で目に入るべきなので先頭に置く */}
        <RelayReceiptTable rows={receipts} timezone={settings.timezone} />
        <GeneralForm initial={general} />
        <EscalationForm
          initial={rules.map((r) => ({
            id: r.id,
            name: r.name,
            thresholdMinutes: r.thresholdMinutes,
            notifyAssignee: r.notifyAssignee,
            notifyManager: r.notifyManager,
            notifyAdmins: r.notifyAdmins,
            notifyGroup: r.notifyGroup,
            enabled: r.enabled,
          }))}
        />
        <StaffTable
          initial={staff.map((s) => ({
            id: s.id,
            name: s.name,
            lineUserId: s.lineUserId,
            email: s.email,
            role: s.role,
            managerId: s.managerId,
            notifyEnabled: s.notifyEnabled,
            active: s.active,
          }))}
        />
        <ChannelTable
          initial={channels.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            target: c.target,
            purpose: c.purpose,
            enabled: c.enabled,
          }))}
          envGroupConfigured={!!env.internalSlackWebhookUrl || !!env.internalLineGroupId}
        />
        <HolidayTable
          initial={holidays.map((h) => ({
            id: h.id,
            date: h.date.toISOString().slice(0, 10),
            name: h.name,
            isOpen: h.isOpen,
          }))}
        />
      </div>
    </AppShell>
  )
}
