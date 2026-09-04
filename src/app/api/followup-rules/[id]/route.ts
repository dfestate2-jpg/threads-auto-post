import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  /** ステータス開始からの経過分数。1分〜365日 */
  offsetMinutes: z.number().int().min(1).max(525_600).optional(),
  label: z.string().min(1).max(120).optional(),
  notifyStaff: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

/**
 * 自動追客ルールの調整。
 * 「何日後に何をするか」は会社ごとに違うため、画面から変えられるようにしてある。
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('ルールの内容が不正です', 400)

    const rule = await prisma.followUpRule.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ ok: true, rule })
  } catch (e) {
    return handleApiError(e)
  }
}
