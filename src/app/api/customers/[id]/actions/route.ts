import { ActionType, CustomerStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadFollowUpContext, recordFollowUpAction } from '@/lib/services/followUp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 追客アクションの記録。【指示書 3・8 / MVP 11】
 *
 * 営業マンの操作はこのエンドポイント1本に集約されている。
 * 「電話した」「内見設定した」「成約した」を1クリックで送るだけで、
 * 最終接触日時・次回アクション・優先度・追客履歴がすべて自動更新される。
 */
const schema = z.object({
  actionType: z.nativeEnum(ActionType),
  /** 指定するとステータスを変更し、そのステータスの追客リズムを開始する */
  nextStatus: z.nativeEnum(CustomerStatus).nullable().optional(),
  result: z.string().max(200).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  lostReason: z.string().max(500).nullable().optional(),
  contractAmount: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)
    const { id } = await context.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('アクションの内容が不正です', 400)
    const body = parsed.data

    // システム処理は自動追客の内部用。画面からは記録させない
    if (body.actionType === ActionType.SYSTEM) return jsonError('この操作は指定できません', 400)

    const ctx = await loadFollowUpContext()
    const result = await recordFollowUpAction(
      {
        customerId: id,
        staffId: session.staffId,
        actionType: body.actionType,
        nextStatus: body.nextStatus ?? null,
        result: body.result ?? null,
        note: body.note ?? null,
        lostReason: body.lostReason ?? null,
        contractAmount: body.contractAmount ?? null,
      },
      ctx,
    )
    if (!result) return jsonError('顧客が見つかりません', 404)

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'followup.action',
        targetType: 'customer',
        targetId: id,
        detail: { actionType: body.actionType, nextStatus: body.nextStatus ?? null },
      },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return handleApiError(e)
  }
}
