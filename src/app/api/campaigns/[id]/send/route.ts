/**
 * 配信開始。ここでは対象を確定してキューに積むだけで、実際の送信は Cron が行う。
 *
 * 「押した瞬間に3,000通送る」設計にしていないのは、
 * タイムアウトで途中まで送られた状態が最も事故になりやすいため。
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { isMailConfigured } from '@/lib/email/client'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { countSegment, queueCampaign, segmentOf } from '@/lib/services/campaign'
import { assertSenderConfigured } from '@/lib/services/campaignRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const schema = z.object({
  /** 対象件数の確認画面で表示した件数。ここがずれていたら送信しない */
  expectedTotal: z.number().int().min(0).optional(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    if (!isMailConfigured()) {
      return jsonError('メール送信プロバイダ（MAIL_PROVIDER）が未設定です。設定するまで実送信はできません', 409)
    }
    // 法定表示に必要な差出人情報が欠けたまま送信を始めさせない
    assertSenderConfigured()

    const now = new Date()

    // 確認画面で見た件数と実際の対象がずれていたら、キューに積む**前に**止める。
    // 積んでから止めても Cron が送り始めてしまうため、順序が重要。
    if (parsed.data.expectedTotal !== undefined) {
      const campaign = await prisma.campaign.findUnique({ where: { id } })
      if (!campaign) return jsonError('配信が見つかりません', 404)
      const current = await countSegment(segmentOf(campaign), now)
      if (current !== parsed.data.expectedTotal) {
        return jsonError(
          `対象件数が変わりました（確認時: ${parsed.data.expectedTotal}件 → 現在: ${current}件）。もう一度確認してください`,
          409,
          { total: current },
        )
      }
    }

    const result = await queueCampaign(id, now)
    if (!result.ok) return jsonError(result.reason, 409)

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
