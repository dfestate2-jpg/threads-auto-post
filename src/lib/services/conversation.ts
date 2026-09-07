import { Direction, FollowUpSource, HandlingStatus, type Prisma, ReplyState, ResolvedVia } from '@prisma/client'

import { buildExcerpt } from '@/lib/domain/notificationText'
import { computeNextReminderAt, isAwaitingReply } from '@/lib/domain/reminderSchedule'
import { prisma } from '@/lib/prisma'
import { applyOutboundFollowUp, type FollowUpContext } from './followUp'
import { buildPolicy, type PolicyContext } from './policy'

/** conversations に載せる最終メッセージ抜粋の保存長（通知時に更に短縮される） */
const STORED_EXCERPT_LENGTH = 300

type Tx = Prisma.TransactionClient

export interface InboundInput {
  lineUserId: string
  lineMessageId: string | null
  messageType: string
  text: string | null
  sentAt: Date
  raw?: unknown
  profile?: { displayName?: string | null; pictureUrl?: string | null } | null
}

export interface InboundResult {
  duplicate: boolean
  customerId: string
  conversationId: string
  /** 未返信として計上したか（過去メッセージの遅延到着では false） */
  awaiting: boolean
  nextReminderAt: Date | null
}

/**
 * 顧客からのメッセージを記録し、未返信状態を更新する。【基本フロー 1〜3 / 仕様①】
 *
 * - 同一 lineMessageId は必ず1回しか登録しない（Webhook 再送への冪等性）
 * - 追加メッセージが来たら awaitingSince を最新へ動かし、カウントを再スタートする
 * - firstUnrepliedAt は動かさない（連投で通知が先送りされ続けるのを防ぐ保険）
 */
export async function recordInboundMessage(input: InboundInput, ctx: PolicyContext): Promise<InboundResult> {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { lineUserId: input.lineUserId },
      create: {
        lineUserId: input.lineUserId,
        displayName: input.profile?.displayName ?? null,
        pictureUrl: input.profile?.pictureUrl ?? null,
      },
      update: {
        blocked: false,
        ...(input.profile?.displayName ? { displayName: input.profile.displayName } : {}),
        ...(input.profile?.pictureUrl ? { pictureUrl: input.profile.pictureUrl } : {}),
      },
    })

    const conversation =
      (await tx.conversation.findUnique({ where: { customerId: customer.id } })) ??
      (await tx.conversation.create({ data: { customerId: customer.id } }))

    // --- 冪等性: 同じ LINE メッセージIDは二度処理しない ---
    if (input.lineMessageId) {
      const existing = await tx.message.findUnique({ where: { lineMessageId: input.lineMessageId } })
      if (existing) {
        return {
          duplicate: true,
          customerId: customer.id,
          conversationId: conversation.id,
          awaiting: conversation.replyState === ReplyState.AWAITING,
          nextReminderAt: conversation.nextReminderAt,
        }
      }
    }

    await tx.message.create({
      data: {
        customerId: customer.id,
        conversationId: conversation.id,
        direction: Direction.INBOUND,
        lineMessageId: input.lineMessageId,
        messageType: input.messageType,
        text: input.text,
        sentAt: input.sentAt,
        source: 'LINE_WEBHOOK',
        raw: (input.raw ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })

    const prevLastInbound = conversation.lastInboundAt
    const newLastInboundAt =
      prevLastInbound && prevLastInbound.getTime() > input.sentAt.getTime() ? prevLastInbound : input.sentAt
    const isNewest = newLastInboundAt.getTime() === input.sentAt.getTime()

    const awaiting = isAwaitingReply(newLastInboundAt, conversation.lastOutboundAt)
    if (!awaiting) {
      // 既に返信済みより古いメッセージが遅れて届いたケース。ログだけ残して状態は変えない
      return {
        duplicate: false,
        customerId: customer.id,
        conversationId: conversation.id,
        awaiting: false,
        nextReminderAt: conversation.nextReminderAt,
      }
    }

    const wasAwaiting = conversation.replyState === ReplyState.AWAITING && !!conversation.firstUnrepliedAt
    const firstUnrepliedAt =
      wasAwaiting && conversation.firstUnrepliedAt
        ? conversation.firstUnrepliedAt.getTime() <= input.sentAt.getTime()
          ? conversation.firstUnrepliedAt
          : input.sentAt
        : input.sentAt

    const policy = buildPolicy(ctx, customer.reminderIntervalMinutes)
    const schedule = computeNextReminderAt(
      {
        awaitingSince: newLastInboundAt,
        firstUnrepliedAt,
        // 未返信サイクル内の通知回数。返信があるまでリセットしない
        reminderCount: wasAwaiting ? conversation.reminderCount : 0,
        lastReminderAt: wasAwaiting ? conversation.lastReminderAt : null,
        escalationLevel: wasAwaiting ? conversation.escalationLevel : 0,
      },
      policy,
    )

    // 対応中 / 要確認 は人が付けた状態なので維持し、対応済みからのみ未対応へ戻す
    const handlingStatus =
      conversation.handlingStatus === HandlingStatus.IN_PROGRESS ||
      conversation.handlingStatus === HandlingStatus.NEEDS_CHECK
        ? conversation.handlingStatus
        : HandlingStatus.UNHANDLED

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        replyState: ReplyState.AWAITING,
        handlingStatus,
        lastInboundAt: newLastInboundAt,
        ...(isNewest
          ? {
              lastInboundMessageId: input.lineMessageId,
              lastInboundText: input.text ? buildExcerpt(input.text, STORED_EXCERPT_LENGTH) : null,
            }
          : {}),
        awaitingSince: newLastInboundAt,
        firstUnrepliedAt,
        reminderCount: wasAwaiting ? conversation.reminderCount : 0,
        lastReminderAt: wasAwaiting ? conversation.lastReminderAt : null,
        escalationLevel: wasAwaiting ? conversation.escalationLevel : 0,
        nextReminderAt: schedule.nextReminderAt,
        resolvedAt: null,
        resolvedVia: null,
        resolvedById: null,
        version: { increment: 1 },
      },
    })

    return {
      duplicate: false,
      customerId: customer.id,
      conversationId: conversation.id,
      awaiting: true,
      nextReminderAt: schedule.nextReminderAt,
    }
  })
}

export interface OutboundInput {
  customerId: string
  text: string | null
  messageType?: string
  sentAt: Date
  sentByStaffId?: string | null
  lineMessageId?: string | null
  /** LINE_WEBHOOK / ADMIN_CONSOLE / INGEST_API / MANUAL */
  source: string
  via: ResolvedVia
  resolvedById?: string | null
  raw?: unknown
}

/**
 * 返信の経路ごとの、追客履歴に残す記録。
 * 「管理画面から送った」のか「LINE公式Managerで返信して対応済みにした」のかは
 * 後から振り返るときに意味が違うので、経路をそのまま残す。
 */
const FOLLOW_UP_RECORD: Record<ResolvedVia, { source: FollowUpSource; result: string }> = {
  ADMIN_REPLY: { source: FollowUpSource.ADMIN_REPLY, result: 'LINE送信（管理画面）' },
  INGEST_API: { source: FollowUpSource.LINE_OUTBOUND, result: 'LINE送信（外部連携）' },
  WEBHOOK: { source: FollowUpSource.LINE_OUTBOUND, result: 'LINE送信' },
  MANUAL: { source: FollowUpSource.MANUAL, result: '対応済みにした' },
  LINE_POSTBACK: { source: FollowUpSource.MANUAL, result: '対応済みにした（社内LINEのボタン）' },
}

export interface OutboundResult {
  conversationId: string
  /** 返信後も未返信が残っているか（返信より新しい顧客メッセージがある場合 true） */
  stillAwaiting: boolean
  nextReminderAt: Date | null
}

/**
 * 担当者の返信を記録し「対応済み」へ遷移させる。【基本フロー 6〜7】
 *
 * この関数と Cron の送信処理は同じ conversations 行を触るため、
 * 「返信済みなのに通知が続く」事故は
 *   ① ここで nextReminderAt を同一トランザクション内で NULL にする
 *   ② 送信側が送信直前に同じ行をロックして未返信判定をやり直す
 * の二重で防いでいる。
 */
export async function recordOutboundMessage(
  input: OutboundInput,
  ctx: PolicyContext,
  followUpCtx: FollowUpContext,
): Promise<OutboundResult> {
  return prisma.$transaction(async (tx) => {
    const conversation =
      (await tx.conversation.findUnique({ where: { customerId: input.customerId } })) ??
      (await tx.conversation.create({ data: { customerId: input.customerId } }))

    await tx.message.create({
      data: {
        customerId: input.customerId,
        conversationId: conversation.id,
        direction: Direction.OUTBOUND,
        lineMessageId: input.lineMessageId ?? null,
        messageType: input.messageType ?? 'text',
        text: input.text,
        sentAt: input.sentAt,
        sentByStaffId: input.sentByStaffId ?? null,
        source: input.source,
        raw: (input.raw ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })

    const newLastOutboundAt =
      conversation.lastOutboundAt && conversation.lastOutboundAt.getTime() > input.sentAt.getTime()
        ? conversation.lastOutboundAt
        : input.sentAt

    const stillAwaiting = isAwaitingReply(conversation.lastInboundAt, newLastOutboundAt)

    if (!stillAwaiting) {
      // 完全に追いついた = 対応済み。リマインドを止める
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          replyState: ReplyState.REPLIED,
          // 「要確認」は人が意図的に立てた印なので返信では解除しない
          handlingStatus:
            conversation.handlingStatus === HandlingStatus.NEEDS_CHECK
              ? HandlingStatus.NEEDS_CHECK
              : HandlingStatus.DONE,
          lastOutboundAt: newLastOutboundAt,
          awaitingSince: null,
          firstUnrepliedAt: null,
          reminderCount: 0,
          lastReminderAt: null,
          nextReminderAt: null,
          escalationLevel: 0,
          resolvedAt: input.sentAt,
          resolvedVia: input.via,
          resolvedById: input.resolvedById ?? null,
          version: { increment: 1 },
        },
      })
      await applyOutboundFollowUp(
        tx,
        {
          customerId: input.customerId,
          at: input.sentAt,
          staffId: input.sentByStaffId ?? null,
          awaitingReplySince: null,
          ...FOLLOW_UP_RECORD[input.via],
          note: input.text?.slice(0, 200) ?? null,
        },
        followUpCtx,
      )
      return { conversationId: conversation.id, stillAwaiting: false, nextReminderAt: null }
    }

    // 返信より新しい顧客メッセージが既にある → 未返信サイクルを張り直す
    const firstUnreplied = await tx.message.findFirst({
      where: { customerId: input.customerId, direction: Direction.INBOUND, sentAt: { gt: newLastOutboundAt } },
      orderBy: { sentAt: 'asc' },
      select: { sentAt: true },
    })
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: input.customerId },
      select: { reminderIntervalMinutes: true },
    })

    const awaitingSince = conversation.lastInboundAt ?? input.sentAt
    const firstUnrepliedAt = firstUnreplied?.sentAt ?? awaitingSince
    const schedule = computeNextReminderAt(
      { awaitingSince, firstUnrepliedAt, reminderCount: 0, lastReminderAt: null, escalationLevel: 0 },
      buildPolicy(ctx, customer.reminderIntervalMinutes),
    )

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        replyState: ReplyState.AWAITING,
        handlingStatus:
          conversation.handlingStatus === HandlingStatus.NEEDS_CHECK
            ? HandlingStatus.NEEDS_CHECK
            : HandlingStatus.IN_PROGRESS,
        lastOutboundAt: newLastOutboundAt,
        awaitingSince,
        firstUnrepliedAt,
        reminderCount: 0,
        lastReminderAt: null,
        escalationLevel: 0,
        nextReminderAt: schedule.nextReminderAt,
        resolvedAt: null,
        resolvedVia: null,
        resolvedById: null,
        version: { increment: 1 },
      },
    })

    /**
     * まだ顧客を待たせている。次回アクションは「返信する」のままにしておく必要があるため、
     * 待たせ始めた時刻を渡す。
     */
    await applyOutboundFollowUp(
      tx,
      {
        customerId: input.customerId,
        at: input.sentAt,
        staffId: input.sentByStaffId ?? null,
        awaitingReplySince: firstUnrepliedAt,
        ...FOLLOW_UP_RECORD[input.via],
        note: input.text?.slice(0, 200) ?? null,
      },
      followUpCtx,
    )

    return { conversationId: conversation.id, stillAwaiting: true, nextReminderAt: schedule.nextReminderAt }
  })
}

/**
 * 管理画面から手動で「対応済み」にする。
 * LINE公式アカウントManagerから返信した場合など、システムが返信を検知できないときの補完操作。
 * 状態機械の一貫性を保つため、監査可能な OUTBOUND レコードを1件残す。
 */
export async function markResolvedManually(
  customerId: string,
  actor: { id: string | null; staffId: string | null },
  ctx: PolicyContext,
  followUpCtx: FollowUpContext,
  note?: string,
): Promise<OutboundResult> {
  return recordOutboundMessage(
    {
      customerId,
      text: note ?? null,
      messageType: 'manual_resolution',
      sentAt: new Date(),
      sentByStaffId: actor.staffId,
      source: 'MANUAL',
      via: ResolvedVia.MANUAL,
      resolvedById: actor.id,
    },
    ctx,
    followUpCtx,
  )
}

/**
 * 設定変更・担当者変更のあとにリマインド予定を引き直す。
 * 未返信中の会話にのみ作用し、返信済みの会話は触らない。
 */
export async function rescheduleConversation(conversationId: string, ctx: PolicyContext): Promise<Date | null> {
  return prisma.$transaction(async (tx: Tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: { select: { reminderIntervalMinutes: true } } },
    })
    if (!conversation || conversation.replyState !== ReplyState.AWAITING) return null
    if (!conversation.awaitingSince || !conversation.firstUnrepliedAt) return null

    const schedule = computeNextReminderAt(
      {
        awaitingSince: conversation.awaitingSince,
        firstUnrepliedAt: conversation.firstUnrepliedAt,
        reminderCount: conversation.reminderCount,
        lastReminderAt: conversation.lastReminderAt,
        escalationLevel: conversation.escalationLevel,
      },
      buildPolicy(ctx, conversation.customer.reminderIntervalMinutes),
    )
    await tx.conversation.update({
      where: { id: conversationId },
      data: { nextReminderAt: schedule.nextReminderAt, version: { increment: 1 } },
    })
    return schedule.nextReminderAt
  })
}

/**
 * 未返信中の全会話のリマインド予定を引き直す。
 * 営業時間や既定の通知間隔を変更した直後に呼ぶ。
 */
export async function rescheduleAllAwaiting(ctx: PolicyContext, limit = 2000): Promise<number> {
  const targets = await prisma.conversation.findMany({
    where: { replyState: ReplyState.AWAITING },
    select: { id: true },
    take: limit,
  })
  let updated = 0
  for (const t of targets) {
    await rescheduleConversation(t.id, ctx)
    updated += 1
  }
  return updated
}
