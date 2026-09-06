import { StaffRole } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().min(1).max(80),
  lineUserId: z.string().max(120).nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: z.nativeEnum(StaffRole).optional(),
  managerId: z.string().nullable().optional(),
  notifyEnabled: z.boolean().optional(),
})

export async function GET(): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    const staff = await prisma.staff.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] })
    return NextResponse.json({ staff })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('担当者情報が不正です', 400)
    const staff = await prisma.staff.create({
      data: { ...parsed.data, lineUserId: parsed.data.lineUserId || null, email: parsed.data.email || null },
    })
    return NextResponse.json({ ok: true, staff })
  } catch (e) {
    return handleApiError(e)
  }
}
