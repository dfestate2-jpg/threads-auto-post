import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).max(200).optional(),
  staffId: z.string().min(1).nullable().optional(),
})

/** 済みにする・戻す。文言や担当も直せる */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    assertSameOrigin(request)
    const { id } = await context.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)
    const body = parsed.data

    const existing = await prisma.boardTask.findUnique({ where: { id } })
    if (!existing) return jsonError('やることが見つかりません', 404)

    const task = await prisma.boardTask.update({
      where: { id },
      data: {
        ...(body.done === undefined ? {} : { doneAt: body.done ? new Date() : null }),
        ...(body.title === undefined ? {} : { title: body.title.trim() }),
        ...(body.staffId === undefined ? {} : { staffId: body.staffId }),
      },
    })

    return NextResponse.json({ ok: true, task })
  } catch (e) {
    return handleApiError(e)
  }
}

/** 消す。済みにするのとは違い、記録も残らない */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    assertSameOrigin(request)
    const { id } = await context.params

    await prisma.boardTask.deleteMany({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
