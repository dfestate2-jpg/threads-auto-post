import { CampaignChannel } from '@prisma/client'
import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { campaignSchema } from '@/lib/domain/campaignInput'
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
