import { ChannelPurpose, StaffRole } from '@prisma/client'

import type { ChannelTarget, StaffTarget } from '@/lib/domain/escalation'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

export interface NotifyDirectory {
  groupChannels: ChannelTarget[]
  adminChannels: ChannelTarget[]
  fallbackChannels: ChannelTarget[]
  admins: StaffTarget[]
}

/**
 * 通知先の一覧を読み込む。
 * DBに1件も登録が無い場合は環境変数の設定を暗黙のチャネルとして使う
 * （初期導入直後に通知先ゼロで通知が消えるのを防ぐ）。
 */
export async function loadNotifyDirectory(): Promise<NotifyDirectory> {
  const [channels, adminStaff] = await Promise.all([
    prisma.notificationChannel.findMany({ where: { enabled: true } }),
    prisma.staff.findMany({
      where: { active: true, notifyEnabled: true, role: StaffRole.ADMIN, lineUserId: { not: null } },
    }),
  ])

  const pick = (purpose: ChannelPurpose): ChannelTarget[] =>
    channels
      .filter((c) => c.purpose === purpose)
      .map((c) => ({ id: c.id, name: c.name, type: c.type, target: c.target }))

  const groupChannels = pick(ChannelPurpose.DEFAULT_GROUP)
  if (groupChannels.length === 0 && env.internalLineGroupId) {
    groupChannels.push({
      id: 'env:internal-group',
      name: '社内共通グループ',
      type: 'LINE_GROUP',
      target: env.internalLineGroupId,
    })
  }

  const fallbackChannels = pick(ChannelPurpose.FALLBACK)
  if (env.fallbackWebhookUrl) {
    fallbackChannels.push({
      id: 'env:fallback-webhook',
      name: '冗長Webhook',
      type: 'WEBHOOK',
      target: env.fallbackWebhookUrl,
    })
  }

  return {
    groupChannels,
    adminChannels: pick(ChannelPurpose.ADMIN),
    fallbackChannels,
    admins: adminStaff.map((s) => ({
      id: s.id,
      name: s.name,
      lineUserId: s.lineUserId,
      notifyEnabled: s.notifyEnabled,
      active: s.active,
    })),
  }
}
