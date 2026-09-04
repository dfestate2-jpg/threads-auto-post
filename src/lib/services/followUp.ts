/**
 * 追客管理の状態遷移。
 *
 * 営業マンの操作は「ボタンを押す」だけで、
 *   ・最終接触日時の更新
 *   ・次回アクション日時／内容の再計算
 *   ・優先度の再判定
 *   ・追客履歴の記録
 * はすべてここで行う。営業マンに日付やステータスを入力させないための中核。【指示書 3・6】
 */
import {
  ActionType,
  CustomerStatus,
  FollowUpSource,
  Prisma,
  ReplyState,
  type Customer,
  type FollowUpRule,
} from '@prisma/client'

import {
  computePriority,
  isTerminalStatus,
  resolveNextAction,
  type FollowUpRuleLike,
} from '@/lib/domain/followUp'
import { endOfDayIn, startOfDayIn } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'
import { ensureFollowUpDefaults } from './followUpDefaults'
import { getSettings } from './settings'

type Db = Prisma.TransactionClient | typeof prisma

/** 追客の判定に必要な設定をまとめたもの。リクエスト単位・Cron単位で1回だけ作る */
export interface FollowUpContext {
  rules: FollowUpRuleLike[]
  timezone: string
  now: Date
  startOfToday: Date
  endOfToday: Date
}

const RULE_QUERY = { where: { enabled: true }, orderBy: [{ status: 'asc' as const }, { step: 'asc' as const }] }

export async function loadFollowUpContext(now = new Date()): Promise<FollowUpContext> {
  const [settings, rules] = await Promise.all([getSettings(), prisma.followUpRule.findMany(RULE_QUERY)])
  if (rules.length > 0) return buildFollowUpContext(rules, settings.timezone, now)

  /**
   * 既に稼働している環境へ後から追客管理を入れた場合、初期セットアップ（/setup）は
   * 済んでいるため追客ルールが投入されない。空なら入れ直す。
   * upsert で書くので、二重に走っても重複せず既存の調整も消さない。
   */
  await ensureFollowUpDefaults(prisma)
  const seeded = await prisma.followUpRule.findMany(RULE_QUERY)
  return buildFollowUpContext(seeded, settings.timezone, now)
}

export function buildFollowUpContext(rules: FollowUpRuleLike[], timezone: string, now = new Date()): FollowUpContext {
  return {
    rules,
    timezone,
    now,
    startOfToday: startOfDayIn(timezone, now),
    endOfToday: endOfDayIn(timezone, now),
  }
}

/** 追客状態の再計算に必要な顧客の値だけを取り出した型 */
export interface FollowUpStateInput {
  status: CustomerStatus
  statusSince: Date
  followUpStep: number
  autoFollowEnabled: boolean
  priorityOverride: Customer['priorityOverride']
  moveInBy: Date | null
  /** 顧客からのLINEに未返信なら、その受信時刻 */
  awaitingReplySince: Date | null
}

export interface FollowUpStateUpdate {
  nextActionAt: Date | null
  nextActionType: ActionType | null
  nextActionNote: string | null
  priority: Customer['priority']
}

/**
 * 次回アクションと優先度を計算する。DB は触らない。
 * 「顧客を待たせている（未返信）」状態はどのルールよりも優先される。
 */
export function computeFollowUpState(input: FollowUpStateInput, ctx: FollowUpContext): FollowUpStateUpdate {
  const next = resolveNextAction(
    {
      status: input.status,
      statusSince: input.statusSince,
      followUpStep: input.followUpStep,
      autoFollowEnabled: input.autoFollowEnabled,
      awaitingReplySince: input.awaitingReplySince,
    },
    ctx.rules,
  )

  const priority = computePriority({
    status: input.status,
    nextActionAt: next.at,
    override: input.priorityOverride,
    moveInBy: input.moveInBy,
    autoFollowEnabled: input.autoFollowEnabled,
    awaitingOurReply: input.awaitingReplySince !== null,
    now: ctx.now,
    startOfToday: ctx.startOfToday,
    endOfToday: ctx.endOfToday,
  })

  return {
    nextActionAt: next.at,
    nextActionType: next.type,
    nextActionNote: next.note,
    priority,
  }
}

/**
 * 顧客1件の追客状態を計算し直して保存する。
 * 顧客情報・担当者・ステータスが変わったあとに必ず通す。
 */
export async function recomputeCustomer(db: Db, customerId: string, ctx: FollowUpContext): Promise<void> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { conversation: { select: { replyState: true, lastInboundAt: true } } },
  })
  if (!customer) return

  const update = computeFollowUpState(
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
  await db.customer.update({ where: { id: customerId }, data: update })
}

/** 未返信リマインド側の状態から「顧客を待たせ始めた時刻」を取り出す */
export function awaitingReplySinceOf(
  conversation: { replyState: ReplyState; lastInboundAt: Date | null } | null | undefined,
): Date | null {
  if (!conversation) return null
  if (conversation.replyState !== ReplyState.AWAITING) return null
  return conversation.lastInboundAt
}

// ---------------------------------------------------------------------------
// 追客アクションの記録（営業マンのボタン操作）
// ---------------------------------------------------------------------------

export interface RecordActionInput {
  customerId: string
  staffId?: string | null
  actionType: ActionType
  source?: FollowUpSource
  /** 対応結果（応答あり / 不在 / 送信のみ など） */
  result?: string | null
  note?: string | null
  /** 指定するとステータスを変更し、そのステータスの追客リズムを最初から始める */
  nextStatus?: CustomerStatus | null
  lostReason?: string | null
  contractAmount?: number | null
  occurredAt?: Date
  /** 自動処理の二重実行を防ぐキー */
  dedupeKey?: string | null
  /**
   * 追客ステップを1つ進めるか。
   * 「電話した」「LINEした」のような接触は進める。ステータス変更時は 0 に戻すため無関係。
   */
  advanceStep?: boolean
  /** 最終接触日時を更新するか（システム処理では更新しない） */
  touchContact?: boolean
}

export interface RecordActionResult {
  customerId: string
  status: CustomerStatus
  nextActionAt: Date | null
  nextActionNote: string | null
  priority: Customer['priority']
  duplicated: boolean
}

/**
 * 追客アクションを1件記録し、次回アクションまで自動で引き直す。【指示書 3・8】
 *
 * 営業マンの操作はこの1回の呼び出しに集約される。
 * ステータスを指定した場合は「そのステータスの追客リズムを今から開始する」意味になり、
 * 指定しない場合は同じステータスのまま次のステップへ進む。
 */
export async function recordFollowUpAction(
  input: RecordActionInput,
  ctx: FollowUpContext,
): Promise<RecordActionResult | null> {
  const occurredAt = input.occurredAt ?? ctx.now

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      include: { conversation: { select: { replyState: true, lastInboundAt: true } } },
    })
    if (!customer) return null

    // --- 冪等性：同じ自動処理を二度実行しない ---
    if (input.dedupeKey) {
      const existing = await tx.followUpLog.findUnique({ where: { dedupeKey: input.dedupeKey } })
      if (existing) {
        return {
          customerId: customer.id,
          status: customer.status,
          nextActionAt: customer.nextActionAt,
          nextActionNote: customer.nextActionNote,
          priority: customer.priority,
          duplicated: true,
        }
      }
    }

    const statusChanged = input.nextStatus != null
    const status = input.nextStatus ?? customer.status
    // ステータスを指定した操作は「そのステータスを今から開始する」。指定なしは次のステップへ
    const statusSince = statusChanged ? occurredAt : customer.statusSince
    const followUpStep = statusChanged ? 0 : customer.followUpStep + (input.advanceStep === false ? 0 : 1)

    const touchContact = input.touchContact ?? input.actionType !== ActionType.SYSTEM
    const lastContactAt = touchContact ? occurredAt : customer.lastContactAt

    const state = computeFollowUpState(
      {
        status,
        statusSince,
        followUpStep,
        autoFollowEnabled: customer.autoFollowEnabled,
        priorityOverride: customer.priorityOverride,
        moveInBy: customer.moveInBy,
        // 営業マンが接触した時点で「待たせている」状態は解消したとみなす
        awaitingReplySince: touchContact ? null : awaitingReplySinceOf(customer.conversation),
      },
      ctx,
    )

    await tx.customer.update({
      where: { id: customer.id },
      data: {
        status,
        statusSince,
        followUpStep,
        lastContactAt,
        ...state,
        ...(status === CustomerStatus.CONTRACTED
          ? { contractedAt: occurredAt, ...(input.contractAmount != null ? { contractAmount: input.contractAmount } : {}) }
          : {}),
        ...(status === CustomerStatus.LOST ? { lostAt: occurredAt, lostReason: input.lostReason ?? null } : {}),
      },
    })

    await tx.followUpLog.create({
      data: {
        customerId: customer.id,
        staffId: input.staffId ?? null,
        actionType: input.actionType,
        source: input.source ?? FollowUpSource.MANUAL,
        result: input.result ?? null,
        note: input.note ?? null,
        statusBefore: customer.status,
        statusAfter: status,
        // 期限に間に合ったかを後から分析できるよう、予定していた日時を残す
        scheduledFor: customer.nextActionAt,
        occurredAt,
        dedupeKey: input.dedupeKey ?? null,
      },
    })

    return {
      customerId: customer.id,
      status,
      nextActionAt: state.nextActionAt,
      nextActionNote: state.nextActionNote,
      priority: state.priority,
      duplicated: false,
    }
  })
}

// ---------------------------------------------------------------------------
// LINE の動きに連動した自動更新【指示書 4】
// ---------------------------------------------------------------------------

/** 返信が来たら追客対象として復活させるステータス */
const REVIVE_FROM: CustomerStatus[] = [CustomerStatus.NO_REPLY, CustomerStatus.DORMANT, CustomerStatus.ON_HOLD]

/**
 * 顧客からLINEが届いたときの追客状態の更新。
 *
 * ステータスを営業マンに入力させないための自動判定のひとつ。
 * 「返信なし」「休眠」「保留」から返信が来たら、生きている反響として復活させる。
 */
export async function onCustomerInbound(customerId: string, at: Date, ctx: FollowUpContext): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) return
  if (isTerminalStatus(customer.status)) return

  const revived = REVIVE_FROM.includes(customer.status)
  const status = revived ? CustomerStatus.FIRST_CONTACTED : customer.status

  const state = computeFollowUpState(
    {
      status,
      statusSince: at,
      followUpStep: 0,
      autoFollowEnabled: customer.autoFollowEnabled,
      priorityOverride: customer.priorityOverride,
      moveInBy: customer.moveInBy,
      awaitingReplySince: at,
    },
    ctx,
  )

  await prisma.customer.update({
    where: { id: customerId },
    data: { status, statusSince: at, followUpStep: 0, lastContactAt: at, ...state },
  })

  await prisma.followUpLog.create({
    data: {
      customerId,
      actionType: ActionType.LINE,
      source: FollowUpSource.LINE_INBOUND,
      result: '顧客から返信',
      statusBefore: customer.status,
      statusAfter: status,
      scheduledFor: customer.nextActionAt,
      occurredAt: at,
    },
  })
}

/**
 * 顧客へLINEを送ったときの追客状態の更新。
 * 管理画面からの返信・外部連携からの取り込みの両方から呼ばれる。
 */
/** 返信・対応済みを記録したときに、追客側へ何を残すか */
export interface OutboundFollowUpInput {
  customerId: string
  at: Date
  staffId: string | null
  /**
   * 返信したあとも顧客を待たせている場合、その受信時刻。
   * 返信より新しいメッセージが既に届いているケースで、
   * 次回アクションを「返信する」のまま維持するために使う。
   */
  awaitingReplySince: Date | null
  source: FollowUpSource
  /** 追客履歴に残す一言（「LINE送信（管理画面）」「対応済みにした」など） */
  result: string
  note?: string | null
}

/**
 * 顧客へ返信した／対応済みにしたときの追客状態の更新。
 *
 * **必ず recordOutboundMessage の中から、会話の更新と同じトランザクションで呼ぶこと。**
 * 別々に更新すると、「対応済みにしたのに次回アクションが『返信する』のまま」という
 * 食い違いが生まれる。実際にそれが起きたため、呼び出しを1か所に集約してある。
 */
export async function applyOutboundFollowUp(
  db: Db,
  input: OutboundFollowUpInput,
  ctx: FollowUpContext,
): Promise<void> {
  const customer = await db.customer.findUnique({ where: { id: input.customerId } })
  if (!customer || isTerminalStatus(customer.status)) return

  // 新規反響への初回送信は「初回対応済」へ自動で進める
  const status = customer.status === CustomerStatus.NEW_INQUIRY ? CustomerStatus.FIRST_CONTACTED : customer.status
  const statusChanged = status !== customer.status
  const statusSince = statusChanged ? input.at : customer.statusSince
  const followUpStep = statusChanged ? 0 : customer.followUpStep + 1

  const state = computeFollowUpState(
    {
      status,
      statusSince,
      followUpStep,
      autoFollowEnabled: customer.autoFollowEnabled,
      priorityOverride: customer.priorityOverride,
      moveInBy: customer.moveInBy,
      awaitingReplySince: input.awaitingReplySince,
    },
    ctx,
  )

  await db.customer.update({
    where: { id: input.customerId },
    data: { status, statusSince, followUpStep, lastContactAt: input.at, ...state },
  })

  await db.followUpLog.create({
    data: {
      customerId: input.customerId,
      staffId: input.staffId,
      actionType: ActionType.LINE,
      source: input.source,
      result: input.result,
      note: input.note ?? null,
      statusBefore: customer.status,
      statusAfter: status,
      scheduledFor: customer.nextActionAt,
      occurredAt: input.at,
    },
  })
}
