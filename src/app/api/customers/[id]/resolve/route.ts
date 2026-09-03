import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { markResolvedManually } from '@/lib/services/conversation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ note: z.string().max(500).optional(), version: z.number().int().optional() })

/**
 * LINE公式アカウントManager 側で返信した場合に、手動で「対応済み」にする。
 * 監査できるよう OUTBOUND レコードを1件残す。
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)
    const { id } = await context.params
    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    const body = parsed.success ? parsed.data : {}

    const conversation = await prisma.conversation.findUnique({ where: { customerId: id } })
    if (!conversation) return jsonError('会話が見つかりません', 404)
    if (body.version !== undefined && conversation.version !== body.version) {
      return jsonError('他の担当者が更新しました。画面を再読み込みしてください', 409, {
        currentVersion: conversation.version,
      })
    }

    const ctx = await loadPolicyContext()
    const result = await markResolvedManually(id, { id: session.userId, staffId: session.staffId }, ctx, body.note)

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'conversation.resolve_manual',
        targetType: 'customer',
        targetId: id,
        detail: { note: body.note ?? null } as object,
      },
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return handleApiError(e)
  }
}
