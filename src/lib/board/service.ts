/**
 * 追客ボードの操作。
 *
 * 状態を変えるのはここだけ。入口は3つあるが（ヒアリングシート・一覧の角度・LINEのボタン）、
 * **次回追客日を決める処理は1か所に集めてある**。散らばると、片方だけ直して
 * もう片方が古い動きのまま残る。前のシステムで実際に起きた事故なので繰り返さない。
 *
 * リマインドシステムのテーブル（Conversation / Reminder / Message）には
 * 一切書き込まない。Staff も読むだけ。
 *
 * Customer に書くのは2つだけ：
 *   - assigneeId（追客の担当＝顧客の担当を1つに保つため）
 *   - status（追客終了を押したときの 成約 / 失注。→ syncCustomerStatus）
 * どちらもリマインド側の関数（recordFollowUpAction）を通して書く。
 * 自前で顧客テーブルを組み立てると、statusSince や失注日の記録が抜ける。
 */
import {
  ActionType,
  BoardEventType,
  BoardOutcome,
  CustomerStatus,
  FollowUpSource,
  type BoardEntry,
  type Prisma,
} from '@prisma/client'

import { dateKeyOf } from '@/lib/domain/time'
import { isTerminalStatus } from '@/lib/domain/followUp'
import { prisma } from '@/lib/prisma'
import { loadFollowUpContext, recordFollowUpAction } from '@/lib/services/followUp'
import { isAngle, nextDue, type Angle } from './ladder'
import type { BoardContext } from './settings'

/** トランザクションの中でも外でも使えるようにするための型 */
type Db = Prisma.TransactionClient | typeof prisma

/**
 * 追客を始めるとき、その顧客の行がまだ無ければ作る。
 *
 * 担当者はここに持たない。顧客の担当（Customer.assigneeId）ただ1つが正。
 */
export async function ensureEntry(db: Db, customerId: string): Promise<BoardEntry> {
  const existing = await db.boardEntry.findUnique({ where: { customerId } })
  if (existing) return existing
  return db.boardEntry.create({ data: { customerId } })
}

/**
 * 次回追客日を計算して、行に書き戻す。
 *
 * `streak` を呼び出し側から渡すのは、「電話がつながった＝0に戻す」
 * 「つながらなかった＝1つ進める」の判断が場面ごとに違うため。
 */
async function applyNextDue(
  db: Db,
  entry: BoardEntry,
  angle: number | null,
  streak: number,
  ctx: BoardContext,
  extra: Prisma.BoardEntryUpdateInput = {},
): Promise<BoardEntry> {
  if (!isAngle(angle)) {
    // 角度なし＝まだ判断していない。追客の対象に入れない
    return db.boardEntry.update({
      where: { id: entry.id },
      data: { angle: null, dueAt: null, noAnswerStreak: 0, ...extra },
    })
  }

  const due = nextDue({
    angle,
    streak,
    from: ctx.now,
    table: ctx.table,
    timezone: ctx.timezone,
    notify: ctx.notify,
  })

  // 追い切った場合（角度2の 14,30,end など）は、追客を自動で終える。
  // 期限なしのまま一覧に残しても、誰も判断できないため
  const exhausted = due.at === null && due.exhausted

  return db.boardEntry.update({
    where: { id: entry.id },
    data: {
      angle,
      dueAt: due.at,
      noAnswerStreak: streak,
      ...(exhausted ? { endedAt: ctx.now, endedOutcome: BoardOutcome.NO_CHANCE } : {}),
      ...extra,
    },
  })
}

async function logEvent(
  db: Db,
  entryId: string,
  type: BoardEventType,
  data: {
    angleBefore?: number | null
    angleAfter?: number | null
    outcome?: BoardOutcome | null
    staffId?: string | null
    detail?: string | null
    at: Date
  },
): Promise<void> {
  await db.boardEvent.create({
    data: {
      entryId,
      type,
      angleBefore: data.angleBefore ?? null,
      angleAfter: data.angleAfter ?? null,
      outcome: data.outcome ?? null,
      staffId: data.staffId ?? null,
      detail: data.detail ?? null,
      at: data.at,
    },
  })
}

// ---------------------------------------------------------------------------
// 入口①　一覧で角度を選ぶだけ（電話していなくても追客に入れられる）
// ---------------------------------------------------------------------------

export interface SetAngleInput {
  customerId: string
  /** null にすると「まだ判断していない」に戻る */
  angle: number | null
  staffId: string | null
}

export interface SetAngleResult {
  entry: BoardEntry
  /** 次にいつ追うか。画面に「9月8日に通知します」と出すため */
  dueAt: Date | null
  /** 追い切って自動終了した */
  ended: boolean
}

/**
 * 角度を付ける・変える。
 *
 * 角度を選んだ瞬間に追客リストへ入り、今日やることにも載る。
 * 電話したかどうかは問わない——これが「感度の高い人を拾う」ための入口。
 */
export async function setAngle(input: SetAngleInput, ctx: BoardContext): Promise<SetAngleResult> {
  const { result, previous } = await prisma.$transaction(async (tx) => {
    const entry = await ensureEntry(tx, input.customerId)
    const before = entry.angle

    // 角度を人が付け直したということは、状況を見直したということ。
    // 「反応がない回数」は 0 に戻す（前の空き具合を引きずらせない）
    const updated = await applyNextDue(tx, entry, input.angle, 0, ctx, {
      lastActionAt: ctx.now,
      // 終了済みの人に角度を付け直したら、追客を再開する
      endedAt: null,
      endedOutcome: null,
      // 戻し先は使い切ったので消す。残すと次の再開で古い値へ戻してしまう
      statusBefore: null,
      // 通知済みの印を外して、今日ぶんとして出せるようにする
      notifiedOn: null,
    })

    await logEvent(tx, entry.id, BoardEventType.ANGLE_SET, {
      angleBefore: before,
      angleAfter: input.angle,
      staffId: input.staffId,
      detail: input.angle === null ? '角度を外した' : `角度を${input.angle}にした`,
      at: ctx.now,
    })

    return {
      result: { entry: updated, dueAt: updated.dueAt, ended: updated.endedAt !== null },
      previous: entry,
    }
  })

  await restoreCustomerStatus(previous, input.staffId, ctx)
  return result
}

// ---------------------------------------------------------------------------
// 入口②　ヒアリングシート
// ---------------------------------------------------------------------------

export interface CallMemoInput {
  customerId: string
  calledOn: Date
  staffId: string | null
  angle: Angle
  customerTask?: string | null
  staffTask?: string | null
  /** 手で期限を決めたい場合。指定すれば角度からの自動計算より優先する */
  dueOverride?: Date | null
  createdById: string | null
}

export interface CallMemoResult {
  entry: BoardEntry
  dueAt: Date | null
  ended: boolean
}

/** 接客や電話のあと、ヒアリングシートを登録する。角度から次回追客日が自動で決まる */
export async function addCallMemo(input: CallMemoInput, ctx: BoardContext): Promise<CallMemoResult> {
  const { result, previous } = await prisma.$transaction(async (tx) => {
    const entry = await ensureEntry(tx, input.customerId)
    const before = entry.angle

    const updated = await applyNextDue(tx, entry, input.angle, 0, ctx, {
      customerTask: input.customerTask ?? null,
      staffTask: input.staffTask ?? null,
      lastActionAt: ctx.now,
      endedAt: null,
      endedOutcome: null,
      // 再開したので、控えていた戻し先は使い切り
      statusBefore: null,
      notifiedOn: null,
    })

    // シートで担当を選んだら、それが顧客の担当になる。
    // 追客の担当と顧客の担当は同じ人、という前提を1か所で守る
    if (input.staffId) {
      await tx.customer.update({ where: { id: input.customerId }, data: { assigneeId: input.staffId } })
    }

    // 手で期限を上書きした場合は、自動計算のあとで差し替える。
    // 計算を飛ばさずに一度通すのは、上書きを外したときに自動へ戻せるようにするため
    const final = input.dueOverride
      ? await tx.boardEntry.update({ where: { id: entry.id }, data: { dueAt: input.dueOverride } })
      : updated

    await tx.boardCallMemo.create({
      data: {
        entryId: entry.id,
        calledOn: input.calledOn,
        staffId: input.staffId,
        angle: input.angle,
        customerTask: input.customerTask ?? null,
        staffTask: input.staffTask ?? null,
        dueOverride: input.dueOverride ?? null,
        createdById: input.createdById,
      },
    })

    await logEvent(tx, entry.id, BoardEventType.CALL_MEMO, {
      angleBefore: before,
      angleAfter: input.angle,
      staffId: input.staffId,
      detail: 'ヒアリングシートを登録',
      at: ctx.now,
    })

    return {
      result: { entry: final, dueAt: final.dueAt, ended: final.endedAt !== null },
      previous: entry,
    }
  })

  await restoreCustomerStatus(previous, input.staffId, ctx)
  return result
}

// ---------------------------------------------------------------------------
// 入口③　LINEの通知ボタン／今日やることのボタン
// ---------------------------------------------------------------------------

export interface ActResult {
  entry: BoardEntry
  dueAt: Date | null
  ended: boolean
  /** 角度を聞き直す画面へ進むべきか */
  needsAngle: boolean
}

/**
 * 「電話した」。
 *
 * 設定で「角度を聞き直す」が有効なら、まだ次回は決めずに角度の入力を促す。
 * 無効なら、いまの角度のまま次回をセットする。
 */
export async function actCalled(entryId: string, staffId: string | null, ctx: BoardContext): Promise<ActResult> {
  const entry = await prisma.boardEntry.findUnique({ where: { id: entryId } })
  if (!entry) throw new Error('追客の対象が見つかりません')

  if (ctx.settings.askAngleAfterCall) {
    // ここではまだ状態を変えない。角度を選んだ時点で setAngle が動く。
    // 先に次回をセットしてしまうと、角度を選ばずに離脱したときに
    // 「電話したのに前の間隔のまま」という中途半端な状態が残る
    return { entry, dueAt: entry.dueAt, ended: false, needsAngle: true }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await applyNextDue(tx, entry, entry.angle, 0, ctx, {
      lastActionAt: ctx.now,
      notifiedOn: null,
    })
    await logEvent(tx, entry.id, BoardEventType.CALLED, {
      angleBefore: entry.angle,
      angleAfter: entry.angle,
      staffId,
      detail: '電話した',
      at: ctx.now,
    })
    return { entry: updated, dueAt: updated.dueAt, ended: updated.endedAt !== null, needsAngle: false }
  })
}

/**
 * 「つながらない」。
 *
 * 反応がない回数を1つ進めるので、次回までの間隔が設定に従って空く。
 * 同じ人を毎日呼び出して通知全体が無視されるのを防ぐための仕組み。
 */
export async function actNoAnswer(entryId: string, staffId: string | null, ctx: BoardContext): Promise<ActResult> {
  const entry = await prisma.boardEntry.findUnique({ where: { id: entryId } })
  if (!entry) throw new Error('追客の対象が見つかりません')

  return prisma.$transaction(async (tx) => {
    const updated = await applyNextDue(tx, entry, entry.angle, entry.noAnswerStreak + 1, ctx, {
      lastActionAt: ctx.now,
      notifiedOn: null,
    })
    await logEvent(tx, entry.id, BoardEventType.NO_ANSWER, {
      angleBefore: entry.angle,
      angleAfter: entry.angle,
      staffId,
      detail: `つながらない（${entry.noAnswerStreak + 1}回目）`,
      at: ctx.now,
    })
    return { entry: updated, dueAt: updated.dueAt, ended: updated.endedAt !== null, needsAngle: false }
  })
}

/** 「追客終了」。理由を残して、リストから外す */
export async function actEnd(
  entryId: string,
  outcome: BoardOutcome,
  staffId: string | null,
  ctx: BoardContext,
): Promise<ActResult> {
  const entry = await prisma.boardEntry.findUnique({ where: { id: entryId } })
  if (!entry) throw new Error('追客の対象が見つかりません')

  // 顧客側のステータスも動かすので、動かす前の値をここで押さえる。
  // 再開したときの戻し先になる
  const customer = await prisma.customer.findUnique({
    where: { id: entry.customerId },
    select: { status: true },
  })

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.boardEntry.update({
      where: { id: entry.id },
      data: {
        dueAt: null,
        endedAt: ctx.now,
        endedOutcome: outcome,
        lastActionAt: ctx.now,
        notifiedOn: null,
        // すでに終了済みの人をもう一度終了しても、最初の値を上書きしない
        ...(entry.endedAt === null && customer ? { statusBefore: customer.status } : {}),
      },
    })
    await logEvent(tx, entry.id, BoardEventType.ENDED, {
      angleBefore: entry.angle,
      angleAfter: entry.angle,
      outcome,
      staffId,
      detail: OUTCOME_LABEL[outcome],
      at: ctx.now,
    })
    return { entry: updated, dueAt: null, ended: true, needsAngle: false }
  })

  await syncCustomerStatus(entry.customerId, OUTCOME_STATUS[outcome], staffId, `追客終了：${OUTCOME_LABEL[outcome]}`, ctx)

  return result
}

/**
 * 追客終了の理由を、顧客のステータスに対応させる。
 *
 * ここを繋いでいないと、他社で決まった人が追客一覧からは消えるのに
 * 顧客一覧には動いている人として残り続ける。半年で顧客一覧が
 * 終わった人だらけになり、何件動いているのか読めなくなる。
 */
const OUTCOME_STATUS: Record<BoardOutcome, CustomerStatus> = {
  CONTRACTED: CustomerStatus.CONTRACTED,
  LOST_OTHER: CustomerStatus.LOST,
  NO_CHANCE: CustomerStatus.LOST,
}

/**
 * 顧客のステータスを変える。
 *
 * 自分で customer.update せず、リマインド側の記録関数を通す。
 * ステータス変更には失注日・成約日・statusSince・履歴の記録が付いてくるので、
 * 自前で組むと必ずどれかが抜ける。
 *
 * 追客ボードの更新とは別のトランザクションになる。ここが失敗しても
 * 追客の終了は取り消さない——**取り消すと、営業が押したボタンが
 * 効かなかったことになる**。片方だけ進んだ場合の見え方は、この機能を
 * 入れる前とまったく同じ（追客は終了、顧客一覧には残る）なので、
 * 悪化はしない。失敗はログに残して後から追えるようにする。
 */
async function syncCustomerStatus(
  customerId: string,
  status: CustomerStatus,
  staffId: string | null,
  note: string,
  ctx: BoardContext,
): Promise<void> {
  try {
    const current = await prisma.customer.findUnique({ where: { id: customerId }, select: { status: true } })
    // すでにそのステータスなら触らない。二度押しで statusSince が動くのを防ぐ
    if (!current || current.status === status) return

    const followUpCtx = await loadFollowUpContext(ctx.now)
    await recordFollowUpAction(
      {
        customerId,
        staffId,
        actionType: ActionType.OTHER,
        source: FollowUpSource.MANUAL,
        nextStatus: status,
        lostReason: status === CustomerStatus.LOST ? note : null,
        note,
        occurredAt: ctx.now,
        // 追客を終える操作であって、お客さまに連絡した訳ではない。
        // 最終接触日は動かさない
        touchContact: false,
      },
      followUpCtx,
    )

    // ステータスを戻すと、リマインド側が自分の「次回アクション」を引き直す。
    // 追客の日付は「次回追客」に持っているので、ここに別の日付が入ると
    // 顧客一覧と追客一覧で違う日が出てしまう。ボードが動かした顧客は、
    // 次回アクションを常に空にしておく——**日付の持ち場所は1つ**。
    //
    // 終了させたときは終了系ステータスなので、もともと空になる。
    // 消える情報も無い（終了時点で空になっている）
    await prisma.customer.update({
      where: { id: customerId },
      data: { nextActionAt: null, nextActionType: null, nextActionNote: null },
    })
  } catch (e) {
    console.error('[board] 顧客ステータスを合わせられませんでした', {
      customerId,
      status,
      error: String(e),
    })
  }
}

/**
 * 終了していた人の追客を再開したときに、顧客のステータスを元へ戻す。
 *
 * 戻さないと「追客は動いているのに顧客一覧には出てこない」という、
 * 直そうとしている食い違いの裏返しが起きる。
 *
 * 戻すのは、こちらが終了させたときに控えた値がある場合だけ。
 * もともと失注だった人を勝手に動かすことはしない。
 */
async function restoreCustomerStatus(entry: BoardEntry, staffId: string | null, ctx: BoardContext): Promise<void> {
  const before = entry.statusBefore
  if (entry.endedAt === null || before === null) return
  // 控えた値そのものが終了系なら、戻す先が無い。ボード以前からの失注
  if (isTerminalStatus(before)) return

  await syncCustomerStatus(entry.customerId, before, staffId, '追客を再開', ctx)
}

export const OUTCOME_LABEL: Record<BoardOutcome, string> = {
  CONTRACTED: 'うちで契約になった',
  LOST_OTHER: '他社で契約した',
  NO_CHANCE: '見込みなし',
}

/** 通知を送ったことを記録する。1日1通に抑えるための印 */
export async function markNotified(entryId: string, ctx: BoardContext): Promise<void> {
  await prisma.boardEntry.update({
    where: { id: entryId },
    data: { notifiedOn: dateKeyOf(ctx.now, ctx.timezone) },
  })
}

// ---------------------------------------------------------------------------
// 担当者
// ---------------------------------------------------------------------------

export interface SetAssigneeInput {
  customerId: string
  /** null で担当なし */
  assigneeId: string | null
  /** 操作した人 */
  staffId: string | null
}

/**
 * 担当者を変える。
 *
 * 追客の担当と顧客の担当は**同じ人**なので、書く先は顧客の1か所だけ。
 * 2か所に持って同期させる形にすると、いつか必ず食い違う。
 *
 * これは**リマインドの通知先も同時に変わる**ということでもある。
 * それでよい——1人のお客さまを担当するのは1人、というのが前提だから。
 *
 * リマインドの予定（nextReminderAt）は引き直さない。
 * 予定の計算は会話の状態と顧客ごとの通知間隔だけで決まり、担当者に依存しない。
 * 送信時に担当者を読み直すので、次のリマインドは自動的に新しい担当者へ届く。
 *
 * 次回追客日にも触らない。引き継ぐたびに予定が後ろへ流れると、
 * 引き継いだ案件ほど追客が遅れることになる。
 */
export async function setBoardAssignee(input: SetAssigneeInput, ctx: BoardContext): Promise<BoardEntry> {
  return prisma.$transaction(async (tx) => {
    const entry = await ensureEntry(tx, input.customerId)
    await tx.customer.update({ where: { id: input.customerId }, data: { assigneeId: input.assigneeId } })
    await logEvent(tx, entry.id, BoardEventType.ANGLE_SET, {
      angleBefore: entry.angle,
      angleAfter: entry.angle,
      staffId: input.staffId,
      detail: input.assigneeId === null ? '担当を外した' : '担当を変えた',
      at: ctx.now,
    })
    return entry
  })
}
