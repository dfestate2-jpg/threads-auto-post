import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { setAngle } from '@/lib/board/service'
import { loadBoardContext } from '@/lib/board/settings'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  customerId: z.string().min(1),
  /** null にすると「まだ判断していない」に戻る */
  angle: z.number().int().min(1).max(5).nullable(),
})

/**
 * 一覧から角度を付ける・変える。
 *
 * これが「電話していなくても追客に入れる」入口。角度を選んだ瞬間に
 * 次回追客日が決まり、今日やることとLINEの両方に出るようになる。
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    const ctx = await loadBoardContext()
    const result = await setAngle(
      { customerId: parsed.data.customerId, angle: parsed.data.angle, staffId: session.staffId },
      ctx,
    )

    return NextResponse.json({
      ok: true,
      angle: result.entry.angle,
      dueAt: result.dueAt,
      ended: result.ended,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
