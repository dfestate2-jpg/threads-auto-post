import { BoardOutcome } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { actCalled, actEnd, actNoAnswer, setAngle } from '@/lib/board/service'
import { loadBoardContext } from '@/lib/board/settings'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  entryId: z.string().min(1),
  action: z.enum(['called', 'noanswer', 'end', 'angle']),
  /** action=angle のとき必須 */
  angle: z.number().int().min(1).max(5).optional(),
  /** action=end のとき必須 */
  outcome: z.nativeEnum(BoardOutcome).optional(),
})

/**
 * 今日やることのボタン。LINEのリンクから来た操作も最終的にここへ集まる。
 *
 * どちらから押しても同じ関数を通るので、
 * 「LINEでは片付いたのに画面には残っている」ということが起きない。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)
    const { entryId, action, angle, outcome } = parsed.data

    const ctx = await loadBoardContext()

    switch (action) {
      case 'called': {
        const r = await actCalled(entryId, session.staffId, ctx)
        return NextResponse.json({ ok: true, needsAngle: r.needsAngle, dueAt: r.dueAt })
      }
      case 'noanswer': {
        const r = await actNoAnswer(entryId, session.staffId, ctx)
        return NextResponse.json({ ok: true, dueAt: r.dueAt, ended: r.ended })
      }
      case 'end': {
        if (!outcome) return jsonError('終了の理由を選んでください', 400)
        await actEnd(entryId, outcome, session.staffId, ctx)
        return NextResponse.json({ ok: true, ended: true })
      }
      case 'angle': {
        if (angle === undefined) return jsonError('角度を選んでください', 400)
        // 角度は顧客に対して付けるので、行から顧客を引き直す
        const entry = await prisma.boardEntry.findUnique({ where: { id: entryId }, select: { customerId: true } })
        if (!entry) return jsonError('追客の対象が見つかりません', 404)
        const r = await setAngle({ customerId: entry.customerId, angle, staffId: session.staffId }, ctx)
        return NextResponse.json({ ok: true, dueAt: r.dueAt, ended: r.ended })
      }
    }
  } catch (e) {
    return handleApiError(e)
  }
}
