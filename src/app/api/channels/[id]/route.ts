import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  /** LINEグループの人数。null = 未登録に戻す */
  memberCount: z.number().int().min(0).max(500).nullable().optional(),
})

/**
 * 現状はグループ人数の更新だけを受ける。
 * LINEの通数は「送信回数 × 届いた人数」で数えるため、人数が分からないと
 * 実際の消費を出せず、「まだ余裕がある」と誤解したまま上限に達してしまう。
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    const channel = await prisma.notificationChannel.update({
      where: { id },
      data: { ...(parsed.data.memberCount !== undefined ? { memberCount: parsed.data.memberCount } : {}) },
    })
    return NextResponse.json({ ok: true, channel })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    await prisma.notificationChannel.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
