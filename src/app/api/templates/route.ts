import { ActionType, CustomerStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, '英小文字・数字・アンダースコアで入力してください'),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  status: z.nativeEnum(CustomerStatus).nullable().optional(),
  actionType: z.nativeEnum(ActionType).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export async function GET(): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    const templates = await prisma.messageTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] })
    return NextResponse.json({ templates })
  } catch (e) {
    return handleApiError(e)
  }
}

/** LINE文章テンプレートの追加。営業マンに文章を考えさせないための資産なので管理者が整備する */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'テンプレートの内容が不正です', 400)

    const exists = await prisma.messageTemplate.findUnique({ where: { key: parsed.data.key } })
    if (exists) return jsonError('同じキーのテンプレートが既にあります', 409)

    const template = await prisma.messageTemplate.create({
      data: { ...parsed.data, status: parsed.data.status ?? null, actionType: parsed.data.actionType ?? null },
    })
    return NextResponse.json({ ok: true, template })
  } catch (e) {
    return handleApiError(e)
  }
}
