import { HandlingStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { markResolvedManually, rescheduleConversation } from '@/lib/services/conversation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  /** 0 = 通知しない / null = 全体設定に従う */
  reminderIntervalMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  handlingStatus: z.nativeEnum(HandlingStatus).optional(),
  /** 楽観ロック用。会話の version を送る */
  version: z.number().int().optional(),
})

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)
    const { id } = await context.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)
    const body = parsed.data

    const customer = await prisma.customer.findUnique({ where: { id }, include: { conversation: true } })
    if (!customer) return jsonError('顧客が見つかりません', 404)

    // 複数担当者の同時操作による上書き事故を防ぐ
    if (body.version !== undefined && customer.conversation && customer.conversation.version !== body.version) {
      return jsonError('他の担当者が更新しました。画面を再読み込みしてください', 409, {
        currentVersion: customer.conversation.version,
      })
    }

    const customerData: Record<string, unknown> = {}
    if (body.name !== undefined) customerData.name = body.name
    if (body.note !== undefined) customerData.note = body.note
    if (body.assigneeId !== undefined) customerData.assigneeId = body.assigneeId
    if (body.reminderIntervalMinutes !== undefined) customerData.reminderIntervalMinutes = body.reminderIntervalMinutes

    if (Object.keys(customerData).length > 0) {
      await prisma.customer.update({ where: { id }, data: customerData })
    }

    const ctx = await loadPolicyContext()

    if (body.handlingStatus !== undefined && customer.conversation) {
      if (body.handlingStatus === HandlingStatus.DONE) {
        // 「対応済み」への変更はリマインドを止める確定操作として扱う
        await markResolvedManually(id, { id: session.userId, staffId: session.staffId }, ctx)
      } else {
        await prisma.conversation.update({
          where: { id: customer.conversation.id },
          data: { handlingStatus: body.handlingStatus, version: { increment: 1 } },
        })
      }
    }

    // 担当者・通知間隔が変わったらリマインド予定を引き直す
    if (
      customer.conversation &&
      (body.assigneeId !== undefined || body.reminderIntervalMinutes !== undefined) &&
      body.handlingStatus !== HandlingStatus.DONE
    ) {
      await rescheduleConversation(customer.conversation.id, ctx)
    }

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'customer.update',
        targetType: 'customer',
        targetId: id,
        detail: { ...body, version: undefined } as object,
      },
    })

    const updated = await prisma.customer.findUnique({ where: { id }, include: { conversation: true } })
    return NextResponse.json({ ok: true, customer: updated })
  } catch (e) {
    return handleApiError(e)
  }
}
