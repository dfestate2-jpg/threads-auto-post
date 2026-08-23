import { ResolvedVia } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { env } from '@/lib/env'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { LineApiError, pushTextMessage } from '@/lib/line/client'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { recordOutboundMessage } from '@/lib/services/conversation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ text: z.string().min(1).max(4900) })

/**
 * 管理画面から顧客へ返信する。
 *
 * **これが返信検知の主経路。**
 * ここを通して返信すれば、LINE への送信と「対応済み」への遷移が同一の操作で完結するため、
 * 「返信したのにリマインドが止まらない」も「返信していないのに止まる」も起きない。
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)
    const { id } = await context.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('送信内容を入力してください', 400)

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) return jsonError('顧客が見つかりません', 404)
    if (customer.blocked) return jsonError('この顧客はブロック済みのため送信できません', 409)

    try {
      await pushTextMessage(env.lineChannelAccessToken, customer.lineUserId, parsed.data.text)
    } catch (e) {
      if (e instanceof LineApiError) {
        console.error('[reply] LINE push failed', { status: e.status })
        return jsonError(`LINEへの送信に失敗しました（${e.status}）`, 502)
      }
      throw e
    }

    // 送信が成功したときだけ「対応済み」にする（送信失敗で通知が止まる事故を防ぐ）
    const ctx = await loadPolicyContext()
    const result = await recordOutboundMessage(
      {
        customerId: id,
        text: parsed.data.text,
        sentAt: new Date(),
        sentByStaffId: session.staffId,
        source: 'ADMIN_CONSOLE',
        via: ResolvedVia.ADMIN_REPLY,
        resolvedById: session.userId,
      },
      ctx,
    )

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return handleApiError(e)
  }
}
