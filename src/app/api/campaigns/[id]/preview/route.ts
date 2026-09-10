/**
 * 送信前の確認。
 * 「何人に届くのか」と「実際に届く文面」を、送信ボタンを押す前に必ず見せる。
 */
import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { isMailConfigured } from '@/lib/email/client'
import { handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { buildMailFor } from '@/lib/services/campaignRunner'
import { loadCampaignProperties, previewSegment, segmentOf } from '@/lib/services/campaign'
import { describeSegment } from '@/lib/services/segment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    const { id } = await context.params

    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return jsonError('配信が見つかりません', 404)

    const now = new Date()
    const segment = segmentOf(campaign)
    const [audience, properties] = await Promise.all([
      previewSegment(segment, now),
      loadCampaignProperties(id),
    ])

    // 1人目の宛先で実際の文面を組み立てる。誰も居なければダミーで見せる
    const sampleRecipient = audience.sample[0] ?? { id: 'preview', email: 'preview@example.com', name: null }
    let rendered: { subject: string; text: string; html: string } | null = null
    let renderError: string | null = null
    try {
      rendered = buildMailFor(
        {
          id: campaign.id,
          subject: campaign.subject,
          body: campaign.body,
          properties: properties.map((p) => ({
            title: p.title,
            propertyType: p.propertyType,
            area: p.area,
            address: p.address,
            price: p.price,
            layout: p.layout,
            sizeSqm: p.sizeSqm,
            stationAccess: p.stationAccess,
            description: p.description,
            url: p.url,
          })),
        },
        { contactId: sampleRecipient.id, address: sampleRecipient.email, name: sampleRecipient.name },
      )
    } catch (e) {
      // 差出人情報や APP_BASE_URL が未設定だとここで落ちる。送信前に気づけるよう理由を返す
      renderError = (e as Error).message
    }

    return NextResponse.json({
      total: audience.total,
      sample: audience.sample,
      segment: describeSegment(segment),
      mailConfigured: isMailConfigured(),
      renderError,
      preview: rendered ? { subject: rendered.subject, text: rendered.text, html: rendered.html } : null,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
