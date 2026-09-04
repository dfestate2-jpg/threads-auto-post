import { PropertyType } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    const properties = await prisma.property.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({ properties })
  } catch (e) {
    return handleApiError(e)
  }
}

const schema = z.object({
  title: z.string().min(1).max(120),
  propertyType: z.nativeEnum(PropertyType).default(PropertyType.OTHER),
  area: z.string().max(60).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  /** 万円単位 */
  price: z.number().int().min(0).max(10_000_000).nullable().optional(),
  layout: z.string().max(40).nullable().optional(),
  sizeSqm: z.number().min(0).max(100_000).nullable().optional(),
  stationAccess: z.string().max(120).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  url: z.string().url().max(500).nullable().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  published: z.boolean().default(true),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('物件情報が不正です', 400)

    const property = await prisma.property.create({ data: parsed.data })
    return NextResponse.json({ ok: true, property })
  } catch (e) {
    return handleApiError(e)
  }
}
