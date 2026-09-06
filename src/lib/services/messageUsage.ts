import { ChannelType } from '@prisma/client'

import type { NotifyTarget } from '@/lib/domain/escalation'
import { dateKeyOf, instantAtDayMinutes } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'

/**
 * LINEの消費通数を実測する。
 *
 * ライトプランは無料通数を超えると **送信そのものができなくなる**（追加購入不可）。
 * 枯渇＝リマインドの停止なので、「たぶんまだ余裕がある」で運用してはいけない。
 *
 * LINEの数え方は **「送信回数 × 届いた人数」**。グループ宛て1回は人数分を消費し、
 * 個人宛ては1通。応答メッセージ（ボタンを押したときの返事）は課金対象外なので数えない。
 */

/** 何の通知で消費したか。内訳を見て手を打てるようにする */
export type UsagePurpose = 'REMINDER' | 'FOLLOWUP' | 'WATCHDOG' | 'TEST' | 'OTHER'

export const PURPOSE_LABEL: Record<UsagePurpose, string> = {
  REMINDER: '未返信リマインド',
  FOLLOWUP: '追客',
  WATCHDOG: 'システム警告',
  TEST: 'テスト送信',
  OTHER: 'その他',
}

/**
 * グループ人数の短期キャッシュ。
 * 1回のリマインド実行で何十通も送るため、毎回引くと無駄が大きい。
 * 人数の変更が反映されるまで最大1分ずれるが、通数の見積もりとしては十分。
 */
const GROUP_SIZE_TTL_MS = 60_000
let groupSizeCache: { at: number; sizes: Map<string, number> } | null = null

async function groupUnits(target: string): Promise<number> {
  const now = Date.now()
  if (!groupSizeCache || now - groupSizeCache.at > GROUP_SIZE_TTL_MS) {
    const channels = await prisma.notificationChannel.findMany({
      where: { type: ChannelType.LINE_GROUP },
      select: { target: true, memberCount: true },
    })
    groupSizeCache = {
      at: now,
      sizes: new Map(channels.filter((c) => c.memberCount && c.memberCount > 0).map((c) => [c.target, c.memberCount!])),
    }
  }
  /**
   * 人数が未登録なら 1 として数える。
   * 実際より **少なく** 見積もることになるが、勝手に大きな数を仮定して
   * 「もう危ない」と誤報するよりはよい。未登録であることは画面側で警告する。
   */
  return groupSizeCache.sizes.get(target) ?? 1
}

/** 送信に成功した1件を記録する。失敗した送信は通数を消費しないので記録しない */
export async function recordMessageUsage(target: NotifyTarget, purpose: UsagePurpose): Promise<void> {
  // Webhook（Slack等）はLINEの通数を消費しない。0通として残し、内訳で見えるようにする
  const units =
    target.channel === 'LINE_USER' ? 1 : target.channel === 'LINE_GROUP' ? await groupUnits(target.target) : 0

  await prisma.messageUsage.create({
    data: { channel: target.channel as ChannelType, target: target.target, units, purpose },
  })
}

export interface MonthlyUsage {
  used: number
  quota: number
  /** 残り。上限を超えていれば 0 */
  remaining: number
  /** この請求月の何日目か（1始まり） */
  dayOfMonth: number
  daysInMonth: number
  /** 今のペースで進んだ場合の月末見込み */
  projected: number
  /** 見込みが上限を超える場合、何日目に到達するか。超えない場合は null */
  exhaustionDay: number | null
  byPurpose: { purpose: UsagePurpose; label: string; units: number }[]
  /** 人数未登録のLINEグループ宛てが含まれる = 実際の消費はこれより多い */
  hasUnknownGroupSize: boolean
}

/** 指定タイムゾーンでの「今月1日 0:00」。集計の区切りは暦月（無料通数が戻る単位） */
export function startOfMonthIn(timezone: string, now: Date): Date {
  const [y, m] = dateKeyOf(now, timezone).split('-')
  return instantAtDayMinutes(`${y}-${m}-01`, 0, timezone)
}

/** タイムゾーン基準の「今日は何日か」（1始まり） */
export function dayOfMonthIn(timezone: string, now: Date): number {
  return Number(dateKeyOf(now, timezone).split('-')[2])
}

/** タイムゾーン基準の「今月は何日あるか」 */
export function daysInMonthIn(timezone: string, now: Date): number {
  const [y, m] = dateKeyOf(now, timezone).split('-').map(Number)
  // 「翌月の0日目」= 今月の末日
  return new Date(Date.UTC(y as number, m as number, 0)).getUTCDate()
}

/**
 * 今月の消費通数をまとめる。
 *
 * LINEの無料通数は暦月で戻るため、集計も暦月で区切る。
 * 「使った量」だけでは手遅れになってから気づくので、**月末見込みと枯渇日**まで出す。
 */
export async function getMonthlyUsage(timezone: string, quota: number, now = new Date()): Promise<MonthlyUsage> {
  const from = startOfMonthIn(timezone, now)
  const rows = await prisma.messageUsage.groupBy({
    by: ['purpose'],
    where: { sentAt: { gte: from } },
    _sum: { units: true },
  })

  const byPurpose = rows
    .map((r) => ({
      purpose: r.purpose as UsagePurpose,
      label: PURPOSE_LABEL[r.purpose as UsagePurpose] ?? r.purpose,
      units: r._sum.units ?? 0,
    }))
    .filter((r) => r.units > 0)
    .sort((a, b) => b.units - a.units)

  const used = byPurpose.reduce((sum, r) => sum + r.units, 0)
  const dayOfMonth = dayOfMonthIn(timezone, now)
  const daysInMonth = daysInMonthIn(timezone, now)
  const perDay = used / dayOfMonth
  const projected = Math.round(perDay * daysInMonth)

  /**
   * 人数が未登録のグループがあると、その分の消費を 1通 として少なく数えている。
   * 「上限まで余裕がある」という誤った安心につながるので、画面で必ず断る。
   */
  const unknownGroups = await prisma.notificationChannel.count({
    where: { enabled: true, type: ChannelType.LINE_GROUP, OR: [{ memberCount: null }, { memberCount: { lte: 0 } }] },
  })

  return {
    used,
    quota,
    remaining: Math.max(0, quota - used),
    dayOfMonth,
    daysInMonth,
    projected,
    exhaustionDay: perDay > 0 && projected > quota ? Math.ceil(quota / perDay) : null,
    byPurpose,
    hasUnknownGroupSize: unknownGroups > 0,
  }
}
