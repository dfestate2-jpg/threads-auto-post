import { StaffRole } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  lineUserId: z.string().max(120).nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: z.nativeEnum(StaffRole).optional(),
  managerId: z.string().nullable().optional(),
  notifyEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
})

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('担当者情報が不正です', 400)
    if (parsed.data.managerId === id) return jsonError('自分自身を責任者に設定することはできません', 400)

    const data = { ...parsed.data }
    if (data.lineUserId === '') data.lineUserId = null
    if (data.email === '') data.email = null

    const staff = await prisma.staff.update({ where: { id }, data })
    return NextResponse.json({ ok: true, staff })
  } catch (e) {
    return handleApiError(e)
  }
}
