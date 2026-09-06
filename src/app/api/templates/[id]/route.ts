import { CustomerStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(4000).optional(),
  status: z.nativeEnum(CustomerStatus).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('テンプレートの内容が不正です', 400)

    const template = await prisma.messageTemplate.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ ok: true, template })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    await prisma.messageTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
