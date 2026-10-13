import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { RESOLVE_ALL_BATCH, resolveAllMatching } from '@/lib/services/bulkResolve'
import { loadPolicyContext } from '@/lib/services/context'
import { loadFollowUpContext } from '@/lib/services/followUp'
import { buildUnrepliedFilter } from '@/lib/services/unrepliedFilter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 絞り込み条件。未返信一覧のURLパラメータと同じものを受け取り、
 * **画面と同じ関数**で条件を組む。別々に組むと、表示している件数と
 * 閉じる件数が食い違い、見えていないものを閉じる事故になる。
 */
const schema = z.object({
  status: z.string().optional(),
  assignee: z.string().optional(),
  awaiting: z.string().optional(),
  q: z.string().max(200).optional(),
  over: z.string().optional(),
})

/**
 * 未返信をまとめて「対応済み」にする。選択なしで押せる入口。
 *
 * 1回では小分けにしか処理しない（`RESOLVE_ALL_BATCH`）。件数が読めないので
 * 1リクエストで全部やろうとすると実行環境の制限時間に当たって途中で切れ、
 * 「どこまで済んだか分からない」状態になる。残り件数を返すので、
 * 呼び出し側は 0 になるまで繰り返すこと。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    const { where } = buildUnrepliedFilter(parsed.data, new Date())
    const result = await resolveAllMatching(
      where,
      { id: session.userId, staffId: session.staffId },
      await loadPolicyContext(),
      await loadFollowUpContext(),
    )

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'conversation.resolve_all',
        targetType: 'conversation',
        targetId: `${result.resolved.length}件`,
        detail: { filter: parsed.data, ...result } as object,
      },
    })

    return NextResponse.json({
      ok: true,
      resolved: result.resolved.length,
      skipped: result.skipped,
      remaining: result.remaining,
      batchSize: RESOLVE_ALL_BATCH,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
