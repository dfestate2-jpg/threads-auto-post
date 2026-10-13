import { ReplyState } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { markResolvedManually } from './conversation'
import type { FollowUpContext } from './followUp'
import type { PolicyContext } from './policy'

/**
 * 1回で処理する上限。
 *
 * 1件ずつトランザクションを張るので、増やすほど1リクエストが長くなり、
 * 実行環境の制限時間に当たって**途中で切れる**。切れても処理済みの分は
 * 確定しているが、画面には結果が返らないので「どこまで済んだか分からない」
 * 状態になる。画面の1ページ（50件）を1回で捌ければ十分。
 */
export const MAX_BULK_ITEMS = 60

export type BulkSkipReason = 'NOT_FOUND' | 'ALREADY_RESOLVED' | 'CONFLICT' | 'FAILED'

export interface BulkResolveItem {
  customerId: string
  /** 楽観ロック用。会話の version。省略すると版の確認をしない */
  version?: number
}

export interface BulkResolveResult {
  resolved: string[]
  skipped: { customerId: string; reason: BulkSkipReason }[]
}

/**
 * 選択した複数の未返信を、まとめて「対応済み」にする。
 *
 * **1件の失敗で全体を巻き戻さない。** 20件のうち1件が競合しただけで
 * 19件やり直しになると、結局1件ずつ押すのと同じ手間に戻る。
 * 件数ごとに独立して処理し、閉じられなかったものは理由を付けて返す。
 * 呼び出し側は、閉じられなかった件数を必ず画面に出すこと。
 * 黙って減ると、残った未返信に誰も気づけない。
 */
export async function bulkResolveConversations(
  items: BulkResolveItem[],
  actor: { id: string | null; staffId: string | null },
  ctx: PolicyContext,
  followUpCtx: FollowUpContext,
): Promise<BulkResolveResult> {
  // 同じ顧客が2回入っていても1回しか処理しない
  const unique = [...new Map(items.map((i) => [i.customerId, i])).values()]

  const resolved: string[] = []
  const skipped: { customerId: string; reason: BulkSkipReason }[] = []

  for (const item of unique) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { customerId: item.customerId },
        select: { version: true, replyState: true },
      })
      if (!conversation) {
        skipped.push({ customerId: item.customerId, reason: 'NOT_FOUND' })
        continue
      }
      // 既に誰かが閉じている。履歴を二重に積まないよう素通りさせる
      if (conversation.replyState !== ReplyState.AWAITING) {
        skipped.push({ customerId: item.customerId, reason: 'ALREADY_RESOLVED' })
        continue
      }
      // 画面を開いてから状態が動いている。勝手に閉じず、読み直してもらう
      if (item.version !== undefined && conversation.version !== item.version) {
        skipped.push({ customerId: item.customerId, reason: 'CONFLICT' })
        continue
      }

      await markResolvedManually(item.customerId, actor, ctx, followUpCtx, '一覧からまとめて対応済みにしました')
      resolved.push(item.customerId)
    } catch (e) {
      // 1件の例外で残りを止めない
      console.error('[bulk-resolve] 1件の処理に失敗しました', { customerId: item.customerId, error: String(e) })
      skipped.push({ customerId: item.customerId, reason: 'FAILED' })
    }
  }

  return { resolved, skipped }
}
