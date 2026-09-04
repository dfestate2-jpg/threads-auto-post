/**
 * 追客の定期実行。【指示書 10・12・13】
 *
 * 営業マンが何もしなくても追客が回り続けるための処理。1日数回動かす想定。
 *   ① 期限が来た自動遷移を適用する（返信なし30日 → 休眠 など）
 *   ② 営業マンへの通知が要る段階（見積書待ち72時間 など）を社内へ通知する
 *   ③ 全顧客の優先度を引き直す（期限超過は当日中に優先度が上がる）
 *
 * どの処理も「期限を過ぎた分をまとめて処理する」形にしてあるため、
 * Cron が数回落ちても追客漏れにならない。
 */
import { ActionType, FollowUpSource, type Customer } from '@prisma/client'

import { ACTION_TYPE_LABEL, CUSTOMER_STATUS_LABEL, TERMINAL_STATUSES, rulesForStatus } from '@/lib/domain/followUp'
import type { NotifyTarget } from '@/lib/domain/escalation'
import { dispatchNotification } from '@/lib/notify/dispatcher'
import { prisma } from '@/lib/prisma'
import {
  awaitingReplySinceOf,
  computeFollowUpState,
  loadFollowUpContext,
  recordFollowUpAction,
  type FollowUpContext,
} from './followUp'
import { loadNotifyDirectory } from './notifyTargets'

/** 1回の実行で処理する上限。取りこぼしは次の実行で処理される */
const BATCH_LIMIT = 500

export interface FollowUpRunResult {
  transitioned: number
  notified: number
  recalculated: number
  failed: number
}

/**
 * 期限の来た顧客の自動処理。
 * 「営業マンがやること」は消化せず、システムが判断できるものだけを進める。
 */
async function processDueCustomers(ctx: FollowUpContext): Promise<{ transitioned: number; notified: number; failed: number }> {
  const due = await prisma.customer.findMany({
    where: {
      status: { notIn: TERMINAL_STATUSES },
      autoFollowEnabled: true,
      nextActionAt: { lte: ctx.now },
    },
    include: { assignee: true },
    orderBy: { nextActionAt: 'asc' },
    take: BATCH_LIMIT,
  })

  let transitioned = 0
  let notified = 0
  let failed = 0
  const directory = await loadNotifyDirectory()

  for (const customer of due) {
    try {
      const rule = rulesForStatus(ctx.rules, customer.status)[customer.followUpStep]
      if (!rule) continue

      // --- ① 自動遷移（返信なし30日 → 休眠 など） ---
      if (rule.transitionTo) {
        const result = await recordFollowUpAction(
          {
            customerId: customer.id,
            actionType: ActionType.SYSTEM,
            source: FollowUpSource.AUTO,
            nextStatus: rule.transitionTo,
            result: `自動遷移：${CUSTOMER_STATUS_LABEL[customer.status]} → ${CUSTOMER_STATUS_LABEL[rule.transitionTo]}`,
            note: rule.label,
            touchContact: false,
            dedupeKey: `transition:${customer.id}:${customer.status}:${customer.statusSince.toISOString()}:${rule.step}`,
          },
          ctx,
        )
        if (result && !result.duplicated) transitioned += 1
        continue
      }

      // --- ② 営業マンへの通知が必要な段階 ---
      if (rule.notifyStaff) {
        const sent = await notifyStaffOfDueAction(customer, ctx, directory)
        if (sent) notified += 1
      }
    } catch (e) {
      failed += 1
      console.error('[followup-cron] 顧客の処理に失敗しました', { customerId: customer.id, error: String(e) })
    }
  }

  return { transitioned, notified, failed }
}

type Directory = Awaited<ReturnType<typeof loadNotifyDirectory>>

/**
 * 「見積書待ちが72時間止まっている」のような、営業マンに気づかせたい段階を社内へ通知する。
 * 記録を残してから送るので、同じ段階で何度も鳴ることはない。
 */
async function notifyStaffOfDueAction(
  customer: Customer & { assignee: { id: string; name: string; lineUserId: string | null; notifyEnabled: boolean } | null },
  ctx: FollowUpContext,
  directory: Directory,
): Promise<boolean> {
  const dedupeKey = `notify:${customer.id}:${customer.status}:${customer.statusSince.toISOString()}:${customer.followUpStep}`
  const already = await prisma.followUpLog.findUnique({ where: { dedupeKey } })
  if (already) return false

  const targets: NotifyTarget[] = []
  if (customer.assignee?.lineUserId && customer.assignee.notifyEnabled) {
    targets.push({
      channel: 'LINE_USER',
      target: customer.assignee.lineUserId,
      label: customer.assignee.name,
      role: 'ASSIGNEE',
    })
  }
  for (const ch of directory.groupChannels) {
    targets.push({ channel: ch.type, target: ch.target, label: ch.name, role: 'GROUP' })
  }
  if (targets.length === 0) return false

  const name = customer.name ?? customer.displayName ?? '（名称未登録）'
  const action = customer.nextActionType ? ACTION_TYPE_LABEL[customer.nextActionType] : '対応'
  const text = [
    '⏰ 追客の対応期限です',
    `顧客：${name}`,
    `状況：${CUSTOMER_STATUS_LABEL[customer.status]}`,
    `やること：${action}／${customer.nextActionNote ?? ''}`,
    customer.assignee ? `担当：${customer.assignee.name}` : '担当：未設定',
  ].join('\n')

  // 送信前に記録する。送信直後に落ちても二重に鳴らさないため
  await prisma.followUpLog.create({
    data: {
      customerId: customer.id,
      actionType: customer.nextActionType ?? ActionType.OTHER,
      source: FollowUpSource.AUTO,
      result: '営業担当へ通知',
      note: customer.nextActionNote,
      statusBefore: customer.status,
      statusAfter: customer.status,
      scheduledFor: customer.nextActionAt,
      occurredAt: ctx.now,
      dedupeKey,
    },
  })

  const { anySucceeded } = await dispatchNotification(targets, text)
  return anySucceeded
}

/**
 * 優先度の引き直し。
 * 「期限を過ぎた」「引越し時期が近づいた」は時間の経過だけで起きるため、
 * 誰も操作しなくても優先度が最新になるよう定期的に計算し直す。
 */
async function recalculatePriorities(ctx: FollowUpContext): Promise<number> {
  const customers = await prisma.customer.findMany({
    where: { status: { notIn: TERMINAL_STATUSES } },
    include: { conversation: { select: { replyState: true, lastInboundAt: true } } },
    take: BATCH_LIMIT * 4,
  })

  let updated = 0
  for (const customer of customers) {
    const state = computeFollowUpState(
      {
        status: customer.status,
        statusSince: customer.statusSince,
        followUpStep: customer.followUpStep,
        autoFollowEnabled: customer.autoFollowEnabled,
        priorityOverride: customer.priorityOverride,
        moveInBy: customer.moveInBy,
        awaitingReplySince: awaitingReplySinceOf(customer.conversation),
      },
      ctx,
    )
    const changed =
      state.priority !== customer.priority ||
      state.nextActionAt?.getTime() !== customer.nextActionAt?.getTime() ||
      state.nextActionType !== customer.nextActionType ||
      state.nextActionNote !== customer.nextActionNote
    if (!changed) continue
    await prisma.customer.update({ where: { id: customer.id }, data: state })
    updated += 1
  }
  return updated
}

/** 追客Cronの本体。/api/cron/followups から呼ばれる */
export async function runFollowUpJob(now = new Date()): Promise<FollowUpRunResult> {
  const run = await prisma.cronRun.create({ data: { job: 'followups', startedAt: now } })
  try {
    const ctx = await loadFollowUpContext(now)
    const due = await processDueCustomers(ctx)
    // 自動遷移で次回アクションが変わるため、遷移を終えてから優先度を引き直す
    const recalculated = await recalculatePriorities(await loadFollowUpContext(now))

    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        claimed: due.transitioned + due.notified,
        sent: due.notified,
        skipped: recalculated,
        failed: due.failed,
      },
    })
    return { ...due, recalculated }
  } catch (e) {
    await prisma.cronRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), error: e instanceof Error ? e.message : String(e) },
    })
    throw e
  }
}
