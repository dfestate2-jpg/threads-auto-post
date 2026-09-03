import { HandlingStatus, Prisma, ReminderKind, ReminderStatus, ReplyState } from '@prisma/client'

import { businessMinutesBetween, isWithinBusinessHours, nextBusinessInstant } from '@/lib/domain/businessHours'
import {
  escalationDedupeKey,
  guardDedupeKey,
  routineDedupeKey,
  watchdogDedupeKey,
} from '@/lib/domain/dedupe'
import {
  currentEscalationLevel,
  newlyCrossedRules,
  resolveNotifyTargets,
  type EscalationRuleInput,
  type NotifyTarget,
  type StaffTarget,
} from '@/lib/domain/escalation'
import { buildNotificationText } from '@/lib/domain/notificationText'
import { computeNextReminderAt, isAwaitingReply } from '@/lib/domain/reminderSchedule'
import { addBusinessMinutes } from '@/lib/domain/businessHours'
import { addMinutes, diffMinutes } from '@/lib/domain/time'
import { env } from '@/lib/env'
import { dispatchFallback, dispatchNotification, type QuickActionOptions } from '@/lib/notify/dispatcher'
import { buildResolveActionData } from '@/lib/line/quickAction'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from './context'
import { loadNotifyDirectory, type NotifyDirectory } from './notifyTargets'
import { buildPolicy, type PolicyContext } from './policy'

/** 1回のCron実行で処理する最大件数 */
const BATCH_SIZE = 200
/**
 * 確保（claim）の有効期限（分）。
 * 送信処理中にプロセスが落ちても、この時間が過ぎれば別の実行が拾い直す。
 * = 通知漏れが構造的に起きない仕組み。
 */
const CLAIM_LEASE_MINUTES = 5
/** 送信失敗時の再試行バックオフ（分） */
const RETRY_BACKOFF_MINUTES = [2, 5, 15, 30] as const

export interface RunSummary {
  claimed: number
  sent: number
  skipped: number
  failed: number
  watchdog: number
  durationMs: number
}

type ProcessOutcome = 'sent' | 'skipped' | 'failed'

/**
 * 期限到来した会話を **原子的に確保する**。
 *
 * `FOR UPDATE SKIP LOCKED` + 「next_reminder_at を lease 分だけ先送りする UPDATE」を
 * ひとつの文で行うため、Cron が多重起動しても同じ会話を2つのワーカーが掴むことはない。
 * → 二重通知の一次防御。（二次防御は reminders.dedupeKey の UNIQUE 制約）
 */
async function claimDueConversations(now: Date, leaseUntil: Date, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH due AS (
      SELECT id
      FROM conversations
      WHERE "replyState" = 'AWAITING'
        AND "nextReminderAt" IS NOT NULL
        AND "nextReminderAt" <= ${now}
      ORDER BY "nextReminderAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE conversations c
    SET "nextReminderAt" = ${leaseUntil}, "updatedAt" = now()
    FROM due
    WHERE c.id = due.id
    RETURNING c.id
  `
  return rows.map((r) => r.id)
}

function toStaffTarget(
  s: { id: string; name: string; lineUserId: string | null; notifyEnabled: boolean; active: boolean } | null,
): StaffTarget | null {
  return s ? { id: s.id, name: s.name, lineUserId: s.lineUserId, notifyEnabled: s.notifyEnabled, active: s.active } : null
}

function detailUrl(customerId: string): string | null {
  const base = env.appBaseUrl
  return base ? `${base.replace(/\/$/, '')}/customers/${customerId}` : null
}

async function clearSchedule(conversationId: string, data: Prisma.ConversationUpdateInput = {}): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { nextReminderAt: null, version: { increment: 1 }, ...data },
  })
}

async function processConversation(
  conversationId: string,
  ctx: PolicyContext,
  rules: EscalationRuleInput[],
  directory: NotifyDirectory,
  now: Date,
): Promise<ProcessOutcome> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: {
        include: { assignee: { include: { manager: true } } },
      },
    },
  })
  if (!conversation) return 'skipped'

  const { customer } = conversation
  const cal = ctx.calendar
  const settings = ctx.settings

  // ---------------------------------------------------------------------
  // 送信直前の再判定。「返信済みなのに通知が続く」事故の最終防波堤。
  // ---------------------------------------------------------------------
  if (
    conversation.replyState !== ReplyState.AWAITING ||
    !conversation.awaitingSince ||
    !conversation.firstUnrepliedAt ||
    !isAwaitingReply(conversation.lastInboundAt, conversation.lastOutboundAt)
  ) {
    await clearSchedule(conversationId, {
      replyState: ReplyState.REPLIED,
      awaitingSince: null,
      firstUnrepliedAt: null,
    })
    return 'skipped'
  }

  // ブロック済み顧客へは送れないので、人が確認できるよう「要確認」に落として止める
  if (customer.blocked) {
    await clearSchedule(conversationId, { handlingStatus: HandlingStatus.NEEDS_CHECK })
    return 'skipped'
  }

  const policy = buildPolicy(ctx, customer.reminderIntervalMinutes)
  if (policy.intervalMinutes <= 0) {
    await clearSchedule(conversationId)
    return 'skipped'
  }

  // ---------------------------------------------------------------------
  // 営業時間外は「送らない」のではなく「次の営業開始まで繰り延べる」
  // ---------------------------------------------------------------------
  if (settings.respectBusinessHours && !isWithinBusinessHours(now, cal)) {
    const resume = nextBusinessInstant(now, cal)
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { nextReminderAt: resume, version: { increment: 1 } },
    })
    return 'skipped'
  }

  const elapsedMinutes = settings.countBusinessHoursOnly
    ? businessMinutesBetween(conversation.awaitingSince, now, cal)
    : diffMinutes(now, conversation.awaitingSince)
  const totalUnrepliedMinutes = settings.countBusinessHoursOnly
    ? businessMinutesBetween(conversation.firstUnrepliedAt, now, cal)
    : diffMinutes(now, conversation.firstUnrepliedAt)

  const crossed = newlyCrossedRules(totalUnrepliedMinutes, conversation.escalationLevel, rules)
  const topCrossed = crossed[crossed.length - 1]

  // 通常の間隔がまだ来ていないのに送るケース = 連投による先送りを打ち消す保険通知
  const routineDueAt = settings.countBusinessHoursOnly
    ? addBusinessMinutes(conversation.awaitingSince, settings.firstReminderDelayMinutes, cal)
    : addMinutes(conversation.awaitingSince, settings.firstReminderDelayMinutes)
  const beforeRoutineDue = now.getTime() < routineDueAt.getTime()

  const kind: ReminderKind = topCrossed
    ? ReminderKind.ESCALATION
    : beforeRoutineDue
      ? ReminderKind.GUARD
      : ReminderKind.ROUTINE

  const sequence = conversation.reminderCount + 1
  const cycleStart = conversation.firstUnrepliedAt
  const dedupeKey = topCrossed
    ? escalationDedupeKey(conversationId, cycleStart, topCrossed.id)
    : kind === ReminderKind.GUARD
      ? guardDedupeKey(conversationId, cycleStart, sequence)
      : routineDedupeKey(conversationId, cycleStart, sequence)

  const assignee = toStaffTarget(customer.assignee)
  const manager = toStaffTarget(customer.assignee?.manager ?? null)
  const targets: NotifyTarget[] = resolveNotifyTargets({
    elapsedMinutes: totalUnrepliedMinutes,
    rules,
    assignee,
    manager,
    admins: directory.admins,
    groupChannels: directory.groupChannels,
    alwaysIncludeGroup: settings.alwaysNotifyDefaultGroup,
    adminChannels: directory.adminChannels,
    fallbackChannels: directory.fallbackChannels,
  })

  const bodyText = buildNotificationText({
    kind,
    customerName: customer.name ?? customer.displayName ?? customer.lineUserId ?? '（名称未登録）',
    unrepliedMinutes: elapsedMinutes,
    totalUnrepliedMinutes,
    lastMessage: conversation.lastInboundText,
    assigneeName: customer.assignee?.name ?? null,
    reminderCount: sequence,
    escalationThresholdMinutes: topCrossed?.thresholdMinutes,
    escalationRuleName: topCrossed?.name,
    detailUrl: detailUrl(customer.id),
    includeMessageBody: settings.includeMessageBodyInNotification,
    excerptLength: settings.messageExcerptLength,
  })

  /**
   * 社内LINE通知に付ける「対応済みにする」ボタン。
   * 公式LINEのチャット画面から返信しても Webhook には届かない（LINE仕様）ため、
   * 営業担当の工数を「タップ1回」にするための経路。
   * cycleStart を署名付きで埋めているので、**古い通知のボタンでは今の未返信を閉じられない**。
   * 署名鍵の未設定などで作れなかった場合はボタン無しで通知する（通知は絶対に止めない）。
   */
  let quick: QuickActionOptions | undefined
  try {
    const data = buildResolveActionData(
      { customerId: customer.id, cycleId: cycleStart.getTime() },
      env.quickActionSecret,
    )
    if (data) {
      quick = {
        prompt: '返信済みの場合はこちらをタップしてください',
        actions: [{ label: '✅ 対応済みにする', data, displayText: '対応済みにする' }],
      }
    }
  } catch (e) {
    console.warn('[reminder] quick action の生成に失敗（ボタン無しで通知します）', String(e))
  }

  // 通知先がひとつも解決できない = 設定不備。黙って消えないよう記録して要確認にする
  if (targets.length === 0) {
    await prisma.reminder.upsert({
      where: { dedupeKey },
      create: {
        conversationId,
        customerId: customer.id,
        kind,
        sequence,
        dedupeKey,
        scheduledFor: now,
        unrepliedMinutes: elapsedMinutes,
        status: ReminderStatus.FAILED,
        attempts: 1,
        targets: [],
        bodyText,
        error: '通知先が1件も解決できませんでした（担当者・社内グループ・冗長Webhookが全て未設定）',
      },
      update: { attempts: { increment: 1 }, status: ReminderStatus.FAILED },
    })
    await dispatchFallback(bodyText)
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        handlingStatus: HandlingStatus.NEEDS_CHECK,
        nextReminderAt: addMinutes(now, 30),
        version: { increment: 1 },
      },
    })
    return 'failed'
  }

  // ---------------------------------------------------------------------
  // 二次防御: dedupeKey の UNIQUE 制約。既に SENT なら絶対に再送しない。
  // ---------------------------------------------------------------------
  const existing = await prisma.reminder.findUnique({ where: { dedupeKey } })
  if (existing?.status === ReminderStatus.SENT) {
    const schedule = computeNextReminderAt(
      {
        awaitingSince: conversation.awaitingSince,
        firstUnrepliedAt: conversation.firstUnrepliedAt,
        reminderCount: conversation.reminderCount,
        lastReminderAt: conversation.lastReminderAt ?? now,
        escalationLevel: Math.max(
          conversation.escalationLevel,
          currentEscalationLevel(totalUnrepliedMinutes, rules),
        ),
      },
      policy,
    )
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { nextReminderAt: schedule.nextReminderAt, version: { increment: 1 } },
    })
    return 'skipped'
  }

  let reminderId: string
  try {
    const reminder = existing
      ? await prisma.reminder.update({
          where: { dedupeKey },
          data: { status: ReminderStatus.PENDING, attempts: { increment: 1 }, bodyText, targets: targets as unknown as Prisma.InputJsonValue },
        })
      : await prisma.reminder.create({
          data: {
            conversationId,
            customerId: customer.id,
            kind,
            sequence,
            dedupeKey,
            scheduledFor: now,
            unrepliedMinutes: elapsedMinutes,
            status: ReminderStatus.PENDING,
            attempts: 1,
            targets: targets as unknown as Prisma.InputJsonValue,
            bodyText,
          },
        })
    reminderId = reminder.id
  } catch (e) {
    // 別ワーカーが同時に確保した。安全側に倒して今回は送らず、短時間後に再確認する
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { nextReminderAt: addMinutes(now, 2), version: { increment: 1 } },
      })
      return 'skipped'
    }
    throw e
  }

  const { results, anySucceeded } = await dispatchNotification(targets, bodyText, quick)

  if (!anySucceeded) {
    const reminder = await prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: ReminderStatus.FAILED,
        error: results
          .map((r) => `${r.target.label}: ${r.error ?? 'unknown'}`)
          .join(' / ')
          .slice(0, 900),
      },
    })
    await dispatchFallback(bodyText)
    const backoff =
      RETRY_BACKOFF_MINUTES[Math.min(reminder.attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)] ?? 30
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        nextReminderAt: addMinutes(now, backoff),
        // 3回失敗したら人の目を入れる
        ...(reminder.attempts >= 3 ? { handlingStatus: HandlingStatus.NEEDS_CHECK } : {}),
        version: { increment: 1 },
      },
    })
    return 'failed'
  }

  const newEscalationLevel = Math.max(
    conversation.escalationLevel,
    currentEscalationLevel(totalUnrepliedMinutes, rules),
  )
  const schedule = computeNextReminderAt(
    {
      awaitingSince: conversation.awaitingSince,
      firstUnrepliedAt: conversation.firstUnrepliedAt,
      reminderCount: sequence,
      lastReminderAt: now,
      escalationLevel: newEscalationLevel,
    },
    policy,
  )

  await prisma.$transaction([
    prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: ReminderStatus.SENT,
        sentAt: now,
        error: results.some((r) => !r.ok)
          ? `一部失敗: ${results.filter((r) => !r.ok).map((r) => r.target.label).join(', ')}`.slice(0, 900)
          : null,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        reminderCount: sequence,
        lastReminderAt: now,
        escalationLevel: newEscalationLevel,
        nextReminderAt: schedule.nextReminderAt,
        version: { increment: 1 },
      },
    }),
  ])

  return 'sent'
}

/**
 * 配信遅延の検知。
 * Cron が動いているのに期限を大きく過ぎた会話が残っている＝異常。
 * 「要確認」に落として管理者へ通知し、静かな取りこぼしを表面化させる。
 */
async function runWatchdog(ctx: PolicyContext, directory: NotifyDirectory, now: Date): Promise<number> {
  const threshold = addMinutes(now, -(ctx.settings.watchdogDelayMinutes + CLAIM_LEASE_MINUTES))
  const stale = await prisma.conversation.findMany({
    where: {
      replyState: ReplyState.AWAITING,
      nextReminderAt: { not: null, lt: threshold },
    },
    include: { customer: true },
    take: 20,
  })
  if (stale.length === 0) return 0

  const adminTargets: NotifyTarget[] = [
    ...directory.admins
      .filter((a) => a.lineUserId)
      .map((a) => ({ channel: 'LINE_USER' as const, target: a.lineUserId as string, label: a.name, role: 'ADMIN' as const })),
    ...directory.adminChannels.map((c) => ({ channel: c.type, target: c.target, label: c.name, role: 'ADMIN' as const })),
    ...directory.fallbackChannels.map((c) => ({ channel: c.type, target: c.target, label: c.name, role: 'FALLBACK' as const })),
  ]

  let notified = 0
  for (const conv of stale) {
    if (!conv.firstUnrepliedAt || !conv.awaitingSince) continue
    const key = watchdogDedupeKey(conv.id, conv.firstUnrepliedAt, now)
    const body = buildNotificationText({
      kind: 'WATCHDOG',
      customerName: conv.customer.name ?? conv.customer.displayName ?? conv.customer.lineUserId ?? '（名称未登録）',
      unrepliedMinutes: diffMinutes(now, conv.awaitingSince),
      totalUnrepliedMinutes: diffMinutes(now, conv.firstUnrepliedAt),
      lastMessage: conv.lastInboundText,
      assigneeName: null,
      reminderCount: conv.reminderCount,
      detailUrl: detailUrl(conv.customerId),
      includeMessageBody: false,
      excerptLength: ctx.settings.messageExcerptLength,
    })
    try {
      await prisma.reminder.create({
        data: {
          conversationId: conv.id,
          customerId: conv.customerId,
          kind: ReminderKind.WATCHDOG,
          sequence: conv.reminderCount,
          dedupeKey: key,
          scheduledFor: now,
          unrepliedMinutes: diffMinutes(now, conv.awaitingSince),
          status: ReminderStatus.PENDING,
          attempts: 1,
          targets: adminTargets as unknown as Prisma.InputJsonValue,
          bodyText: body,
        },
      })
    } catch {
      continue // 直近1時間で既に通知済み
    }
    if (adminTargets.length > 0) await dispatchNotification(adminTargets, body)
    else await dispatchFallback(body)
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { handlingStatus: HandlingStatus.NEEDS_CHECK, version: { increment: 1 } },
    })
    notified += 1
  }
  return notified
}

/** Cron から呼ばれる本体 */
export async function runReminderJob(now = new Date()): Promise<RunSummary> {
  const startedAt = Date.now()
  const run = await prisma.cronRun.create({ data: { job: 'reminders' } })

  const summary: RunSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, watchdog: 0, durationMs: 0 }
  let jobError: string | null = null

  try {
    const [ctx, directory, ruleRows] = await Promise.all([
      loadPolicyContext(now),
      loadNotifyDirectory(),
      prisma.escalationRule.findMany({ where: { enabled: true }, orderBy: { thresholdMinutes: 'asc' } }),
    ])
    const rules: EscalationRuleInput[] = ruleRows.map((r) => ({
      id: r.id,
      name: r.name,
      thresholdMinutes: r.thresholdMinutes,
      notifyAssignee: r.notifyAssignee,
      notifyManager: r.notifyManager,
      notifyAdmins: r.notifyAdmins,
      notifyGroup: r.notifyGroup,
      enabled: r.enabled,
    }))

    summary.watchdog = await runWatchdog(ctx, directory, now)

    const leaseUntil = addMinutes(now, CLAIM_LEASE_MINUTES)
    const ids = await claimDueConversations(now, leaseUntil, BATCH_SIZE)
    summary.claimed = ids.length

    for (const id of ids) {
      try {
        const outcome = await processConversation(id, ctx, rules, directory, now)
        summary[outcome] += 1
      } catch (e) {
        summary.failed += 1
        // 1件の例外で残りの通知が止まらないようにする（通知漏れ防止）
        console.error('[reminders] conversation failed', { conversationId: id, error: String(e) })
        await prisma.conversation
          .update({ where: { id }, data: { nextReminderAt: addMinutes(now, 5) } })
          .catch(() => undefined)
      }
    }
  } catch (e) {
    jobError = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    summary.durationMs = Date.now() - startedAt
    await prisma.cronRun
      .update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          claimed: summary.claimed,
          sent: summary.sent,
          skipped: summary.skipped,
          failed: summary.failed,
          error: jobError,
        },
      })
      .catch(() => undefined)
  }

  return summary
}
