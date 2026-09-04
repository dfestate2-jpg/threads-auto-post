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
import { buildDigestText, buildNotificationText, type DigestEntry } from '@/lib/domain/notificationText'
import { computeNextReminderAt, isAwaitingReply } from '@/lib/domain/reminderSchedule'
import { addBusinessMinutes } from '@/lib/domain/businessHours'
import { addMinutes, diffMinutes } from '@/lib/domain/time'
import { env } from '@/lib/env'
import { dispatchFallback, dispatchNotification, type QuickActionOptions } from '@/lib/notify/dispatcher'
import { buildAssignActionData, buildResolveActionData } from '@/lib/line/quickAction'
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

/**
 * 送信の直前まで準備できた1件。
 * まとめ通知のために、**送信と確定を呼び出し側へ遅らせられる**ようにしている。
 */
interface PendingDelivery {
  conversationId: string
  reminderId: string
  targets: NotifyTarget[]
  /** まとめずに送る場合の本文。まとめ通知が全滅したときの予備送信にも使う */
  bodyText: string
  quick: QuickActionOptions | undefined
  now: Date
  sequence: number
  newEscalationLevel: number
  schedulingInput: { awaitingSince: Date; firstUnrepliedAt: Date }
  policy: ReturnType<typeof buildPolicy>
  digestEntry: DigestEntry
}

type ProcessResult =
  | { kind: 'DONE'; outcome: ProcessOutcome }
  /** まとめ通知に回す。送信も予定の確定もまだ行っていない */
  | { kind: 'DEFERRED'; delivery: PendingDelivery }

async function processConversation(
  conversationId: string,
  ctx: PolicyContext,
  rules: EscalationRuleInput[],
  directory: NotifyDirectory,
  now: Date,
): Promise<ProcessResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: {
        include: { assignee: { include: { manager: true } } },
      },
    },
  })
  if (!conversation) return { kind: 'DONE', outcome: 'skipped' }

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
    return { kind: 'DONE', outcome: 'skipped' }
  }

  // ブロック済み顧客へは送れないので、人が確認できるよう「要確認」に落として止める
  if (customer.blocked) {
    await clearSchedule(conversationId, { handlingStatus: HandlingStatus.NEEDS_CHECK })
    return { kind: 'DONE', outcome: 'skipped' }
  }

  const policy = buildPolicy(ctx, customer.reminderIntervalMinutes)
  if (policy.intervalMinutes <= 0) {
    await clearSchedule(conversationId)
    return { kind: 'DONE', outcome: 'skipped' }
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
    return { kind: 'DONE', outcome: 'skipped' }
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
    /**
     * 「上にも伝わっている」ことが本人に分かるようにする。
     * ルール名は利用者が自由に付けられるので、そのまま出さず
     * 誰に広がったかだけを短く言い換える。
     */
    template: settings.notificationTemplate,
    escalationNote: topCrossed
      ? topCrossed.notifyAdmins
        ? '管理者にも通知'
        : topCrossed.notifyManager
          ? '責任者にも通知'
          : null
      : null,
    detailUrl: detailUrl(customer.id),
    includeMessageBody: settings.includeMessageBodyInNotification,
    excerptLength: settings.messageExcerptLength,
  })

  /**
   * 社内LINE通知に付けるワンタップ操作。
   *
   * 「対応済みにする」— 公式LINEのチャット画面から返信しても Webhook には届かない（LINE仕様）ため、
   * 営業担当の工数を「タップ1回」にするための経路。cycleStart を署名付きで埋めているので、
   * **古い通知のボタンでは今の未返信を閉じられない**。
   *
   * 「自分が担当にする」— 担当者の割り当ては管理画面を開かないとできず、
   * それだと通知を見た流れで決められない。ボタンは同じ push にまとめて載るので
   * **消費通数は増えない**。
   *
   * 署名鍵の未設定などで作れなかった場合はボタン無しで通知する（通知は絶対に止めない）。
   */
  let quick: QuickActionOptions | undefined
  try {
    const target = { customerId: customer.id, cycleId: cycleStart.getTime() }
    const resolveData = buildResolveActionData(target, env.quickActionSecret)
    const assignData = buildAssignActionData(target, env.quickActionSecret)
    const actions = [
      ...(resolveData ? [{ label: '✅ 対応済みにする', data: resolveData, displayText: '対応済みにする' }] : []),
      ...(assignData ? [{ label: '🙋 自分が担当にする', data: assignData, displayText: '自分が担当にする' }] : []),
    ]
    if (actions.length > 0) {
      /**
       * ボタンは本文とは別の吹き出しで出る。通知が何件も溜まると
       * ボタンだけ見ても誰のものか分からず、**別の顧客のボタンを押す**事故が起きる。
       * 宛先の顧客名をボタンの上に必ず出す。
       */
      const label = customer.name ?? customer.displayName ?? customer.lineUserId
      quick = { prompt: `${label} 様への操作`, actions }
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
    return { kind: 'DONE', outcome: 'failed' }
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
    return { kind: 'DONE', outcome: 'skipped' }
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
      return { kind: 'DONE', outcome: 'skipped' }
    }
    throw e
  }

  const delivery: PendingDelivery = {
    conversationId,
    reminderId,
    targets,
    bodyText,
    quick,
    now,
    sequence,
    newEscalationLevel: Math.max(conversation.escalationLevel, currentEscalationLevel(totalUnrepliedMinutes, rules)),
    schedulingInput: {
      awaitingSince: conversation.awaitingSince,
      firstUnrepliedAt: conversation.firstUnrepliedAt,
    },
    policy,
    digestEntry: {
      customerName: customer.name ?? customer.displayName ?? customer.lineUserId ?? '（名称未登録）',
      totalUnrepliedMinutes,
      assigneeName: customer.assignee?.name ?? null,
    },
  }

  /**
   * 2回目以降の通常リマインドは、この場では送らずに呼び出し側へ返す。
   * まとめて1通にするため。**予定の更新と記録は送信結果が出てから**行うので、
   * ここで返しても「送ったことにして予定だけ進む」ことは起きない。
   *
   * エスカレーションと保険通知（連投中）は個別のまま。
   * 「重い」ことを伝える通知なので、まとめて埋もれさせてはいけない。
   */
  if (settings.digestRepeatReminders && kind === ReminderKind.ROUTINE && sequence >= 2) {
    return { kind: 'DEFERRED', delivery }
  }

  const { results, anySucceeded } = await dispatchNotification(targets, bodyText, quick)
  return { kind: 'DONE', outcome: await finalizeDelivery(delivery, results, anySucceeded) }
}

/** 送信結果を反映して、記録と次回予定を確定する */
async function finalizeDelivery(
  d: PendingDelivery,
  results: { target: NotifyTarget; ok: boolean; error?: string }[],
  anySucceeded: boolean,
): Promise<ProcessOutcome> {
  if (!anySucceeded) {
    const reminder = await prisma.reminder.update({
      where: { id: d.reminderId },
      data: {
        status: ReminderStatus.FAILED,
        error: results
          .map((r) => `${r.target.label}: ${r.error ?? 'unknown'}`)
          .join(' / ')
          .slice(0, 900),
      },
    })
    await dispatchFallback(d.bodyText)
    const backoff =
      RETRY_BACKOFF_MINUTES[Math.min(reminder.attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)] ?? 30
    await prisma.conversation.update({
      where: { id: d.conversationId },
      data: {
        nextReminderAt: addMinutes(d.now, backoff),
        // 3回失敗したら人の目を入れる
        ...(reminder.attempts >= 3 ? { handlingStatus: HandlingStatus.NEEDS_CHECK } : {}),
        version: { increment: 1 },
      },
    })
    return 'failed'
  }

  const schedule = computeNextReminderAt(
    {
      awaitingSince: d.schedulingInput.awaitingSince,
      firstUnrepliedAt: d.schedulingInput.firstUnrepliedAt,
      reminderCount: d.sequence,
      lastReminderAt: d.now,
      escalationLevel: d.newEscalationLevel,
    },
    d.policy,
  )

  await prisma.$transaction([
    prisma.reminder.update({
      where: { id: d.reminderId },
      data: {
        status: ReminderStatus.SENT,
        sentAt: d.now,
        error: results.some((r) => !r.ok)
          ? `一部失敗: ${results.filter((r) => !r.ok).map((r) => r.target.label).join(', ')}`.slice(0, 900)
          : null,
      },
    }),
    prisma.conversation.update({
      where: { id: d.conversationId },
      data: {
        reminderCount: d.sequence,
        lastReminderAt: d.now,
        escalationLevel: d.newEscalationLevel,
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

/**
 * まとめ通知の送信。
 *
 * **宛先ごとにまとめる。** 会話によって宛先は違う（担当者の個人LINE、社内グループ…）ので、
 * 全部を1通にして全員へ送ると、他人の担当顧客が個人LINEに流れてしまう。
 * 「その宛先が本来受け取るはずだった分」だけを1通にする。
 *
 * 送信結果は会話ごとに割り戻す。ひとつでも届いた宛先があれば送信成功として
 * 予定を進め、全滅した会話は個別の本文で予備送信したうえで再試行に回す。
 * = まとめたことで通知が消える、という事故を作らない。
 */
async function flushDigest(deliveries: PendingDelivery[]): Promise<{ sent: number; failed: number }> {
  const byTarget = new Map<string, { target: NotifyTarget; items: PendingDelivery[] }>()
  for (const d of deliveries) {
    for (const t of d.targets) {
      const key = `${t.channel}:${t.target}`
      const bucket = byTarget.get(key) ?? { target: t, items: [] }
      bucket.items.push(d)
      byTarget.set(key, bucket)
    }
  }

  /** 会話ID -> 宛先ごとの結果 */
  const perDelivery = new Map<string, { target: NotifyTarget; ok: boolean; error?: string }[]>()
  const record = (d: PendingDelivery, r: { target: NotifyTarget; ok: boolean; error?: string }): void => {
    const list = perDelivery.get(d.conversationId) ?? []
    list.push(r)
    perDelivery.set(d.conversationId, list)
  }

  for (const { target, items } of byTarget.values()) {
    const text = buildDigestText(items.map((d) => d.digestEntry))
    const { results } = await dispatchNotification([target], text)
    const r = results[0]
    for (const d of items) {
      record(d, { target, ok: r?.ok ?? false, error: r?.error })
    }
  }

  let sent = 0
  let failed = 0
  for (const d of deliveries) {
    const results = perDelivery.get(d.conversationId) ?? []
    const outcome = await finalizeDelivery(d, results, results.some((r) => r.ok))
    if (outcome === 'sent') sent += 1
    else failed += 1
  }
  return { sent, failed }
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

    const deferred: PendingDelivery[] = []
    for (const id of ids) {
      try {
        const result = await processConversation(id, ctx, rules, directory, now)
        if (result.kind === 'DEFERRED') deferred.push(result.delivery)
        else summary[result.outcome] += 1
      } catch (e) {
        summary.failed += 1
        // 1件の例外で残りの通知が止まらないようにする（通知漏れ防止）
        console.error('[reminders] conversation failed', { conversationId: id, error: String(e) })
        await prisma.conversation
          .update({ where: { id }, data: { nextReminderAt: addMinutes(now, 5) } })
          .catch(() => undefined)
      }
    }

    if (deferred.length > 0) {
      const digest = await flushDigest(deferred)
      summary.sent += digest.sent
      summary.failed += digest.failed
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
