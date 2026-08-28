import { CampaignChannel, PropertyType } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { campaignSelectForList } from '@/lib/services/campaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    const campaigns = await prisma.campaign.findMany({
      select: campaignSelectForList(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ campaigns })
  } catch (e) {
    return handleApiError(e)
  }
}

export const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  channel: z.nativeEnum(CampaignChannel).default(CampaignChannel.EMAIL),
  propertyIds: z.array(z.string()).max(20).default([]),
  segAreas: z.array(z.string().max(60)).max(20).default([]),
  segBudgetMin: z.number().int().min(0).max(10_000_000).nullable().optional(),
  segBudgetMax: z.number().int().min(0).max(10_000_000).nullable().optional(),
  segTypes: z.array(z.nativeEnum(PropertyType)).max(5).default([]),
  segOptedInOnly: z.boolean().default(true),
  segLineSilentOnly: z.boolean().default(false),
  segLineSilentDays: z.number().int().min(1).max(365).default(30),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const parsed = campaignSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('配信内容が不正です', 400)
    const { propertyIds, ...data } = parsed.data

    if (data.channel !== CampaignChannel.EMAIL) {
      return jsonError('現在はメール配信のみ作成できます', 400)
    }

    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        createdById: session.userId,
        properties: {
          create: propertyIds.map((propertyId, position) => ({ propertyId, position })),
        },
      },
    })
    return NextResponse.json({ ok: true, campaign })
  } catch (e) {
    return handleApiError(e)
  }
}
