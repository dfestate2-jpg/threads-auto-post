import { CustomerStatus, FollowUpPriority } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { computeFollowUpState, loadFollowUpContext } from '@/lib/services/followUp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 顧客登録。【MVP 2】
 *
 * 入力必須は名前だけ。それ以外は分かった時点で足せばよい。
 * 登録した瞬間に「次回アクション」が自動で決まるため、
 * 営業マンが追客日を考える必要はない。
 */
const schema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  lineUserId: z.string().max(120).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  inquiredAt: z.string().datetime().nullable().optional(),
  inquirySource: z.string().max(80).nullable().optional(),
  desiredArea: z.string().max(200).nullable().optional(),
  desiredRent: z.number().int().min(0).max(100_000_000).nullable().optional(),
  moveInTiming: z.string().max(80).nullable().optional(),
  moveInBy: z.string().datetime().nullable().optional(),
  requirements: z.string().max(2000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  priorityOverride: z.nativeEnum(FollowUpPriority).nullable().optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('顧客情報が不正です（お名前は必須です）', 400)
    const body = parsed.data

    const lineUserId = body.lineUserId?.trim() || null
    if (lineUserId) {
      const duplicated = await prisma.customer.findUnique({ where: { lineUserId } })
      if (duplicated) return jsonError('このLINEユーザーIDの顧客は既に登録されています', 409)
    }

    const now = new Date()
    const inquiredAt = body.inquiredAt ? new Date(body.inquiredAt) : now
    const status = body.status ?? CustomerStatus.NEW_INQUIRY
    const ctx = await loadFollowUpContext(now)

    // 登録と同時に次回アクションを確定させる（追客の起点は問い合わせ日時）
    const state = computeFollowUpState(
      {
        status,
        statusSince: inquiredAt,
        followUpStep: 0,
        autoFollowEnabled: true,
        priorityOverride: body.priorityOverride ?? null,
        moveInBy: body.moveInBy ? new Date(body.moveInBy) : null,
        awaitingReplySince: null,
      },
      ctx,
    )

    const customer = await prisma.customer.create({
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        lineUserId,
        assigneeId: body.assigneeId || null,
        inquiredAt,
        inquirySource: body.inquirySource?.trim() || null,
        desiredArea: body.desiredArea?.trim() || null,
        desiredRent: body.desiredRent ?? null,
        moveInTiming: body.moveInTiming?.trim() || null,
        moveInBy: body.moveInBy ? new Date(body.moveInBy) : null,
        requirements: body.requirements?.trim() || null,
        note: body.note?.trim() || null,
        status,
        statusSince: inquiredAt,
        priorityOverride: body.priorityOverride ?? null,
        ...state,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorLabel: session.userId,
        action: 'customer.create',
        targetType: 'customer',
        targetId: customer.id,
        detail: { name: customer.name, inquirySource: customer.inquirySource },
      },
    })

    return NextResponse.json({ ok: true, customer })
  } catch (e) {
    return handleApiError(e)
  }
}
