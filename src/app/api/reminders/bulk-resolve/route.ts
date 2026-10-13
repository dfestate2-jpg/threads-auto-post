import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { MAX_BULK_ITEMS, bulkResolveConversations } from '@/lib/services/bulkResolve'
import { loadPolicyContext } from '@/lib/services/context'
import { loadFollowUpContext } from '@/lib/services/followUp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  items: z
    .array(z.object({ customerId: z.string().min(1), version: z.number().int().optional() }))
    .min(1)
    .max(MAX_BULK_ITEMS),
})

/**
 * 選択した複数の未返信を、まとめて「対応済み」にする。
 *
 * 件数が溜まったときに1件ずつ押すのが現実的でないため用意した入口。
 * ただし **対応済みはリマインドを止める確定操作** なので、画面側で
 * チェックを付けた分だけを受け取る（「全部」を一発で閉じる経路は作らない）。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(`入力値が不正です（1回に指定できるのは${MAX_BULK_ITEMS}件までです）`, 400)

    const result = await bulkResolveConversations(
      parsed.data.items,
      { id: session.userId, staffId: session.staffId },
      await loadPolicyContext(),
      await loadFollowUpContext(),
    )

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'conversation.resolve_bulk',
        targetType: 'conversation',
        targetId: `${result.resolved.length}件`,
        detail: result as object,
      },
    })

    return NextResponse.json({ ok: true, resolved: result.resolved.length, skipped: result.skipped })
  } catch (e) {
    return handleApiError(e)
  }
}
