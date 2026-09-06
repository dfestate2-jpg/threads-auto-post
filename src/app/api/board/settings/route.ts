import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { BOARD_SETTINGS_ID, getBoardSettings } from '@/lib/board/settings'
import { isValidLadderInput } from '@/lib/board/ladder'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 間隔の設定は「3,5,7」「14,30,end」「off」の形だけ受け付ける */
const ladder = z
  .string()
  .max(120)
  .refine(isValidLadderInput, '「3,5,7」「14,30,end」「off」のような形で入力してください')

const schema = z.object({
  angle5Ladder: ladder.optional(),
  angle4Ladder: ladder.optional(),
  angle3Ladder: ladder.optional(),
  angle2Ladder: ladder.optional(),
  angle1Ladder: ladder.optional(),
  notifyHour: z.number().int().min(0).max(23).optional(),
  notifyMinute: z.number().int().min(0).max(59).optional(),
  notifyToStaff: z.boolean().optional(),
  notifyToGroup: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(200).optional(),
  askAngleAfterCall: z.boolean().optional(),
  messageTemplate: z.string().max(2000).nullable().optional(),
})

/** 設定を変えられるのは管理者だけ。全員が触れると原因が追えなくなる */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('ADMIN')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? '入力値が不正です', 400)
    }

    await getBoardSettings()
    const updated = await prisma.boardSettings.update({
      where: { id: BOARD_SETTINGS_ID },
      data: parsed.data,
    })

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'board.settings.update',
        targetType: 'boardSettings',
        targetId: BOARD_SETTINGS_ID,
        detail: parsed.data as object,
      },
    })

    return NextResponse.json({ ok: true, settings: updated })
  } catch (e) {
    return handleApiError(e)
  }
}
