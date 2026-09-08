/**
 * 追客ボードの定期実行。
 *
 * やることは1つだけ：**期限が来た人を、担当者のLINEへ送る。**
 * 状態を勝手に進めることはしない。追客が進むのは、営業がボタンを押したときだけ。
 *
 * リマインドの定期実行（5分おき）とは別枠で、こちらは1時間おきに動く。
 * 送るのは設定した時刻（既定は朝9時）を過ぎたぶん。
 */
import type { BoardEntry, Customer, Staff } from '@prisma/client'

import { dateKeyOf, formatShortDateJa } from '@/lib/domain/time'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { ANGLE_LABEL, isAngle, overdueDays } from './ladder'
import { actionUrl, notifyAccessToken, pushWithLinks, type BoardLinkAction } from './notify'
import { markNotified } from './service'
import { DEFAULT_MESSAGE_TEMPLATE, renderTemplate, type BoardContext } from './settings'
import { buildBoardToken } from './token'

type DueEntry = BoardEntry & {
  // 担当者は顧客側にしか持たない。追客の担当＝顧客の担当
  customer: Pick<Customer, 'id' | 'name' | 'displayName' | 'phone'> & {
    assignee: Pick<Staff, 'id' | 'name' | 'lineUserId' | 'notifyEnabled'> | null
  }
}

export interface BoardRunResult {
  /** 期限が来ていた件数 */
  due: number
  /** 実際に送った通数 */
  sent: number
  /** 宛先が無い等で送れなかった件数 */
  skipped: number
  /** 送信に失敗した件数 */
  failed: number
}

export function customerLabel(c: Pick<Customer, 'name' | 'displayName'>): string {
  return c.name ?? c.displayName ?? '（名称未登録）'
}

/**
 * 通知の本文を作る。
 *
 * 読むのは営業中のスマホ。情報を並べるほど読み飛ばされるので、
 * 載せるのは「誰に・どれだけ待たせているか・何の話か」だけにする。
 */
export function buildBody(entry: DueEntry, ctx: BoardContext): string {
  const name = customerLabel(entry.customer)
  const angle = isAngle(entry.angle) ? entry.angle : null
  const over = entry.dueAt ? overdueDays(entry.dueAt, ctx.now, ctx.timezone) : 0

  const elapsed =
    over > 0
      ? `⚠️ 期限を${over}日過ぎています（${entry.dueAt ? formatShortDateJa(entry.dueAt, ctx.timezone) : ''}）`
      : '本日が追客日です'

  const tasks = [
    entry.customerTask ? `お客さん：${entry.customerTask}` : null,
    entry.staffTask ? `自分：${entry.staffTask}` : null,
  ]
    .filter((t): t is string => t !== null)
    .join('\n')

  const template = ctx.settings.messageTemplate?.trim() || DEFAULT_MESSAGE_TEMPLATE
  const text = renderTemplate(template, {
    顧客名: name,
    角度: angle === null ? '—' : String(angle),
    角度の意味: angle === null ? '—' : ANGLE_LABEL[angle],
    経過: elapsed,
    タスク: tasks,
    'お客さんのタスク': entry.customerTask ?? '',
    '自分のタスク': entry.staffTask ?? '',
    電話番号: entry.customer.phone ?? '',
  })

  // 差し込みが空だと空行が続いて読みにくい。3行以上の空行だけ詰める
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/** 3つのボタン。リンクが作れない環境ではボタン無しで本文だけ送る */
export function buildActions(entryId: string, now: Date): BoardLinkAction[] {
  const specs: { label: string; kind: 'called' | 'noanswer' | 'end' }[] = [
    { label: '対応済み', kind: 'called' },
    { label: 'つながらない', kind: 'noanswer' },
    { label: '追客終了', kind: 'end' },
  ]

  const actions: BoardLinkAction[] = []
  for (const spec of specs) {
    const token = buildBoardToken({ kind: spec.kind, entryId }, now)
    if (!token) continue
    const uri = actionUrl(token)
    if (!uri) continue
    actions.push({ label: spec.label, uri })
  }
  return actions
}

/**
 * 期限が来ていて、今日まだ送っていないものを引く。
 *
 * 期限を過ぎたものも毎日1回だけ送り続ける。1回送って終わりにすると、
 * 見落とした瞬間にその人が消える——追客漏れそのものになる。
 */
async function findDue(ctx: BoardContext): Promise<DueEntry[]> {
  const today = dateKeyOf(ctx.now, ctx.timezone)
  return prisma.boardEntry.findMany({
    where: {
      endedAt: null,
      dueAt: { not: null, lte: ctx.now },
      OR: [{ notifiedOn: null }, { notifiedOn: { not: today } }],
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          displayName: true,
          phone: true,
          assignee: { select: { id: true, name: true, lineUserId: true, notifyEnabled: true } },
        },
      },
    },
    orderBy: [{ dueAt: 'asc' }, { angle: 'desc' }],
    // 1回の実行で無制限に送らない。取りこぼしは次の実行で拾う
    take: 200,
  })
}

/**
 * 追客の通知を送る。
 *
 * 1件の失敗が他を巻き込まないよう、例外は1件ずつ受け止める。
 * 送信に失敗したものは印を付けないので、次の実行でもう一度試される。
 */
export async function runBoardJob(ctx: BoardContext): Promise<BoardRunResult> {
  const entries = await findDue(ctx)
  const result: BoardRunResult = { due: entries.length, sent: 0, skipped: 0, failed: 0 }
  if (entries.length === 0) return result

  const token = notifyAccessToken()
  const groupId = env.internalLineGroupId
  const perStaff = new Map<string, number>()

  for (const entry of entries) {
    const targets: string[] = []

    const assignee = entry.customer.assignee
    if (ctx.settings.notifyToStaff && assignee?.lineUserId && assignee.notifyEnabled) {
      const key = assignee.id
      const used = perStaff.get(key) ?? 0
      // 1人に大量に飛ばすと、通知そのものが読まれなくなる。
      // 上限を超えた分は今日やることで拾ってもらう
      if (used < ctx.settings.dailyLimit) {
        targets.push(assignee.lineUserId)
        perStaff.set(key, used + 1)
      }
    }
    if (ctx.settings.notifyToGroup && groupId) targets.push(groupId)

    if (targets.length === 0) {
      result.skipped += 1
      // 宛先が無い場合も印を付ける。付けないと毎時間ここへ来て、
      // 送れない件を延々と数え続けることになる
      await markNotified(entry.id, ctx).catch(() => undefined)
      continue
    }

    const body = buildBody(entry, ctx)
    const actions = buildActions(entry.id, ctx.now)
    const prompt = `${customerLabel(entry.customer)} 様への対応`

    try {
      for (const to of targets) {
        await pushWithLinks(token, to, body, prompt, actions)
      }
      await markNotified(entry.id, ctx)
      result.sent += 1
    } catch (e) {
      result.failed += 1
      console.error('[board-cron] 通知に失敗しました', { entryId: entry.id, error: String(e) })
    }
  }

  return result
}
