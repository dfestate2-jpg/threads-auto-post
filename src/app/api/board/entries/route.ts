import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { setBoardAssignee, setAngle } from '@/lib/board/service'
import { loadBoardContext } from '@/lib/board/settings'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    customerId: z.string().min(1),
    /** null にすると「まだ判断していない」に戻る */
    angle: z.number().int().min(1).max(5).nullable().optional(),
    /** 追客の担当者。null で担当なし */
    assigneeId: z.string().min(1).nullable().optional(),
  })
  // どちらも入っていない更新は、呼び出し側の組み立てミス。黙って何もしないより弾く
  .refine((v) => v.angle !== undefined || v.assigneeId !== undefined, '変更する項目がありません')

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
    const { customerId, angle, assigneeId } = parsed.data

    // 担当だけを変える場合は、次回追客日を触らない。
    // 引き継いだだけで追客の予定がずれると、引き継ぎのたびに追客が後ろへ流れる
    if (assigneeId !== undefined) {
      await setBoardAssignee({ customerId, assigneeId, staffId: session.staffId }, ctx)
    }

    if (angle === undefined) {
      const entry = await prisma.boardEntry.findUnique({ where: { customerId } })
      return NextResponse.json({ ok: true, angle: entry?.angle ?? null, dueAt: entry?.dueAt ?? null, ended: false })
    }

    const result = await setAngle({ customerId, angle, staffId: session.staffId }, ctx)

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
