/**
 * 「今日やること」の組み立て。【指示書 7・11】
 *
 * 営業マンがログインした瞬間に見る画面のためのデータ。
 * 顧客一覧を見せるのが目的ではないので、**今日手を動かす顧客だけ**を返し、
 * それ以外は件数だけにする。
 */
import type { ActionType, CustomerStatus, FollowUpPriority, Prisma } from '@prisma/client'

import { TERMINAL_STATUSES, bucketOf, overdueDays, reasonLabel, type TodayBucket } from '@/lib/domain/followUp'
import { endOfDayIn, startOfDayIn } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'

export interface TodayRow {
  id: string
  name: string
  status: CustomerStatus
  priority: FollowUpPriority
  nextActionAt: Date | null
  nextActionType: ActionType | null
  nextActionNote: string | null
  assigneeName: string | null
  /** 「見積書待ち 3日」のような一言説明 */
  reason: string
  overdueDays: number
  phone: string | null
  hasLine: boolean
}

export interface TodayList {
  /** 期限超過。赤で最上段 */
  overdue: TodayRow[]
  /** 今日やること（優先度 S / A） */
  top: TodayRow[]
  /** 今日やること（優先度 B / C） */
  normal: TodayRow[]
  /** 追客ルールを消化しきり、営業マンの判断が必要な顧客 */
  needsDecision: TodayRow[]
  /** まだ期限が来ていない＝システムが追客中の人数 */
  autoCount: number
  todayTotal: number
}

const PRIORITY_RANK: Record<FollowUpPriority, number> = { S: 0, A: 1, B: 2, C: 3 }

/** 今日の画面に出す候補の上限。これを超える件数は運用が破綻しているので上位から出す */
const MAX_ROWS = 300

export interface TodayListOptions {
  timezone: string
  now?: Date
  /** 指定するとその担当者の顧客だけ。営業マンは自分の分だけを見る */
  assigneeId?: string | null
  /** true にすると担当者未設定の顧客も含める */
  includeUnassigned?: boolean
}

export async function getTodayList(options: TodayListOptions): Promise<TodayList> {
  const now = options.now ?? new Date()
  const startOfToday = startOfDayIn(options.timezone, now)
  const endOfToday = endOfDayIn(options.timezone, now)

  /**
   * 担当者の絞り込み。
   * 「今日やること」の条件も OR を使うため、両方を AND で組み合わせる。
   * 同じ階層に OR を2つ書くと後勝ちで消えてしまい、他人の顧客まで出てしまう。
   */
  const assigneeCondition: Prisma.CustomerWhereInput | null =
    options.assigneeId == null
      ? null
      : options.includeUnassigned
        ? { OR: [{ assigneeId: options.assigneeId }, { assigneeId: null }] }
        : { assigneeId: options.assigneeId }

  const scoped = (...conditions: Prisma.CustomerWhereInput[]): Prisma.CustomerWhereInput => ({
    status: { notIn: TERMINAL_STATUSES },
    AND: [...(assigneeCondition ? [assigneeCondition] : []), ...conditions],
  })

  const [rows, autoCount] = await Promise.all([
    prisma.customer.findMany({
      where: scoped({
        OR: [
          { nextActionAt: { lte: endOfToday } },
          // ルールを消化しきった顧客。黙って消えないよう必ず拾う
          { nextActionAt: null, autoFollowEnabled: true },
        ],
      }),
      include: { assignee: { select: { name: true } } },
      orderBy: [{ nextActionAt: 'asc' }],
      take: MAX_ROWS,
    }),
    prisma.customer.count({ where: scoped({ nextActionAt: { gt: endOfToday } }) }),
  ])

  const buckets: Record<Exclude<TodayBucket, 'AUTO' | 'NONE'>, TodayRow[]> = {
    OVERDUE: [],
    TOP: [],
    NORMAL: [],
    NEEDS_DECISION: [],
  }

  for (const c of rows) {
    const bucket = bucketOf({
      status: c.status,
      nextActionAt: c.nextActionAt,
      priority: c.priority,
      autoFollowEnabled: c.autoFollowEnabled,
      startOfToday,
      endOfToday,
    })
    if (bucket === 'AUTO' || bucket === 'NONE') continue
    buckets[bucket].push({
      id: c.id,
      name: c.name ?? c.displayName ?? '（名称未登録）',
      status: c.status,
      priority: c.priority,
      nextActionAt: c.nextActionAt,
      nextActionType: c.nextActionType,
      nextActionNote: c.nextActionNote,
      assigneeName: c.assignee?.name ?? null,
      reason: reasonLabel(c.status, c.statusSince, now),
      overdueDays: overdueDays(c.nextActionAt, startOfToday),
      phone: c.phone,
      hasLine: c.lineUserId !== null && !c.blocked,
    })
  }

  const byUrgency = (a: TodayRow, b: TodayRow) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (p !== 0) return p
    return (a.nextActionAt?.getTime() ?? 0) - (b.nextActionAt?.getTime() ?? 0)
  }

  for (const list of Object.values(buckets)) list.sort(byUrgency)

  return {
    overdue: buckets.OVERDUE,
    top: buckets.TOP,
    normal: buckets.NORMAL,
    needsDecision: buckets.NEEDS_DECISION,
    autoCount,
    todayTotal: buckets.OVERDUE.length + buckets.TOP.length + buckets.NORMAL.length + buckets.NEEDS_DECISION.length,
  }
}

/** ダッシュボードの見出し用。期限超過の件数だけを数える */
export async function countOverdue(timezone: string, now = new Date(), assigneeId?: string | null): Promise<number> {
  return prisma.customer.count({
    where: {
      status: { notIn: TERMINAL_STATUSES },
      nextActionAt: { lt: startOfDayIn(timezone, now) },
      ...(assigneeId ? { assigneeId } : {}),
    },
  })
}
