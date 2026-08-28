import { CampaignStatus } from '@prisma/client'
import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { getCampaignProgress, segmentOf } from '@/lib/services/campaign'
import { describeSegment } from '@/lib/services/segment'
import { campaignSchema } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    const { id } = await context.params
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { properties: { include: { property: true }, orderBy: { position: 'asc' } } },
    })
    if (!campaign) return jsonError('配信が見つかりません', 404)

    const progress = await getCampaignProgress(id)
    return NextResponse.json({ campaign, progress, segment: describeSegment(segmentOf(campaign)) })
  } catch (e) {
    return handleApiError(e)
  }
}

/** 編集できるのは送信を始める前だけ。送信済みの内容が後から変わると記録として使えない */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params

    const existing = await prisma.campaign.findUnique({ where: { id }, select: { status: true } })
    if (!existing) return jsonError('配信が見つかりません', 404)
    if (existing.status !== CampaignStatus.DRAFT) {
      return jsonError('送信を開始した配信は編集できません。複製して新しい配信を作成してください', 409)
    }

    const parsed = campaignSchema.partial().safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('配信内容が不正です', 400)
    const { propertyIds, ...data } = parsed.data

    const campaign = await prisma.$transaction(async (tx) => {
      if (propertyIds) {
        await tx.campaignProperty.deleteMany({ where: { campaignId: id } })
        await tx.campaignProperty.createMany({
          data: propertyIds.map((propertyId, position) => ({ campaignId: id, propertyId, position })),
        })
      }
      return tx.campaign.update({ where: { id }, data })
    })

    return NextResponse.json({ ok: true, campaign })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params

    const existing = await prisma.campaign.findUnique({ where: { id }, select: { status: true } })
    if (!existing) return jsonError('配信が見つかりません', 404)
    // 送信履歴は消させない（誰にいつ何を送ったかの記録は残す必要がある）
    if (existing.status !== CampaignStatus.DRAFT) {
      return jsonError('送信を開始した配信は削除できません', 409)
    }

    await prisma.campaign.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
