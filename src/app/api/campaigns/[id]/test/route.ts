/**
 * テスト送信。社内のアドレスへ1通だけ実際に送る。
 *
 * 3,000件を送る前に、迷惑メール判定・文字化け・差し込みミスを必ず自分の目で確認する。
 * 宛先は「ログイン中のユーザー」または「社内担当者として登録済み」のアドレスに限る
 * （この口から任意の宛先へ送れると、配信停止を迂回する経路になってしまう）。
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { normalizeEmail } from '@/lib/email/address'
import { getMailTransport } from '@/lib/email/client'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadCampaignProperties } from '@/lib/services/campaign'
import { assertSenderConfigured, buildMailFor } from '@/lib/services/campaignRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ to: z.string().max(254).optional() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)
    const { id } = await context.params

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true, name: true } })
    if (!me) return jsonError('ログイン情報を確認できません', 401)

    const requested = normalizeEmail(parsed.data.to)
    let to = normalizeEmail(me.email)
    if (requested && requested !== to) {
      const internal = await prisma.staff.count({ where: { email: requested, active: true } })
      const isUser = await prisma.user.count({ where: { email: requested, active: true } })
      if (internal === 0 && isUser === 0) {
        return jsonError('テスト送信は社内メンバーのアドレスにのみ送れます', 403)
      }
      to = requested
    }
    if (!to) return jsonError('送信先アドレスを特定できません', 400)

    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) return jsonError('配信が見つかりません', 404)

    assertSenderConfigured()
    const properties = await loadCampaignProperties(id)
    const mail = buildMailFor(
      {
        id: campaign.id,
        subject: `[テスト送信] ${campaign.subject}`,
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
      // テスト送信の配信停止リンクは踏んでも実在の配信先に影響しないIDを使う
      { contactId: `test-${campaign.id}`, address: to, name: me.name },
    )

    await getMailTransport().send({
      to,
      toName: me.name,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      unsubscribeUrl: mail.unsubscribeUrl,
    })

    return NextResponse.json({ ok: true, to })
  } catch (e) {
    return handleApiError(e)
  }
}
