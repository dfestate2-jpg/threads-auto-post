/**
 * 社内LINE通知の「対応済みにする」ボタン（postback）の適用。【基本フロー 6〜7 の代替経路】
 *
 * 公式LINEのチャット画面から送った返信は Webhook に流れてこない（LINE仕様）ため、
 * 営業担当の工数を増やさずに「返信した」ことを伝えるための最短経路。
 * ルートから切り出してあるのは、HTTP を介さずに検証できるようにするため。
 */
import { ReplyState, ResolvedVia } from '@prisma/client'

import { parseQuickActionData } from '@/lib/line/quickAction'
import type { LineSource } from '@/lib/line/types'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { recordOutboundMessage } from './conversation'
import type { PolicyContext } from './policy'

export type QuickActionOutcome =
  /** 署名不正・形式不正。応答も返さず黙って捨てる */
  | { status: 'INVALID' }
  /** 社内の発信元として認められない */
  | { status: 'FORBIDDEN'; message: string }
  | { status: 'NOT_FOUND'; message: string }
  /** 既に対応済み（複数人が同時に押した場合を含む） */
  | { status: 'ALREADY_RESOLVED'; message: string }
  /** 通知を送った時点より新しい未返信が発生している */
  | { status: 'STALE_CYCLE'; message: string }
  | { status: 'RESOLVED'; message: string; stillAwaiting: boolean }

/**
 * 社内側からの操作として受け付けてよい発信元かを判定する。
 *
 * postback データ自体は HMAC で保護しているが、それに加えて
 * **社内の担当者 / 社内通知グループからのタップに限る**という二重の関門を置く。
 */
async function resolveInternalActor(
  source: LineSource,
): Promise<{ ok: true; staffId: string | null } | { ok: false }> {
  const staffFor = async (userId: string | undefined): Promise<string | null> =>
    userId
      ? (await prisma.staff.findFirst({ where: { lineUserId: userId, active: true }, select: { id: true } }))?.id ??
        null
      : null

  if (source.type === 'user') {
    const staffId = await staffFor(source.userId)
    return staffId ? { ok: true, staffId } : { ok: false }
  }

  const roomTarget = source.groupId ?? source.roomId
  if (!roomTarget) return { ok: false }

  const registered =
    env.internalLineGroupId === roomTarget ||
    (await prisma.notificationChannel.count({
      where: { enabled: true, target: roomTarget, type: { in: ['LINE_GROUP', 'LINE_USER'] } },
    })) > 0
  if (!registered) return { ok: false }

  // グループ内の誰が押したかは分かるので、担当者として登録済みなら記録に残す
  return { ok: true, staffId: await staffFor(source.userId) }
}

export async function applyQuickAction(
  input: { data: string | null | undefined; source: LineSource; raw?: unknown },
  ctx: PolicyContext,
): Promise<QuickActionOutcome> {
  const action = parseQuickActionData(input.data, env.quickActionSecret)
  if (!action) return { status: 'INVALID' }

  const actor = await resolveInternalActor(input.source)
  if (!actor.ok) {
    return {
      status: 'FORBIDDEN',
      message: 'この操作は社内の通知グループ、または担当者として登録済みのアカウントからのみ実行できます。',
    }
  }

  const conversation = await prisma.conversation.findUnique({
    where: { customerId: action.customerId },
    select: { replyState: true, firstUnrepliedAt: true, customer: { select: { name: true, displayName: true } } },
  })
  if (!conversation) {
    return { status: 'NOT_FOUND', message: '対象の顧客が見つかりませんでした。管理画面から確認してください。' }
  }

  const name = conversation.customer.name ?? conversation.customer.displayName ?? 'この顧客'

  if (conversation.replyState !== ReplyState.AWAITING) {
    return { status: 'ALREADY_RESOLVED', message: `${name} は既に対応済みです。` }
  }

  /**
   * 古い通知のボタンで「今の未返信」を閉じてしまう事故を防ぐ要。
   * 通知時点のサイクルと現在のサイクルが違う = その後に新しい問い合わせが来ている。
   */
  if (conversation.firstUnrepliedAt?.getTime() !== action.cycleId) {
    return {
      status: 'STALE_CYCLE',
      message: `この通知は古い未返信のものです。${name} には、その後に新しいメッセージが届いています。管理画面で確認してください。`,
    }
  }

  const result = await recordOutboundMessage(
    {
      customerId: action.customerId,
      text: null,
      messageType: 'line_postback_resolution',
      sentAt: new Date(),
      sentByStaffId: actor.staffId,
      source: 'LINE_POSTBACK',
      via: ResolvedVia.LINE_POSTBACK,
      raw: input.raw,
    },
    ctx,
  )

  return {
    status: 'RESOLVED',
    stillAwaiting: result.stillAwaiting,
    message: result.stillAwaiting
      ? `${name} を対応済みにしましたが、その後に新しいメッセージが届いています。リマインドは継続します。`
      : `${name} を対応済みにしました。リマインドを停止します。`,
  }
}
