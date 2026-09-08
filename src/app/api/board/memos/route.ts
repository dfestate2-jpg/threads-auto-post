import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { addCallMemo } from '@/lib/board/service'
import { loadBoardContext } from '@/lib/board/settings'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  /** 既存顧客を選んだ場合 */
  customerId: z.string().min(1).optional(),
  /** 選ばずに手で打った場合。この名前で新しく作る */
  customerName: z.string().min(1).max(120).optional(),
  calledOn: z.string().datetime(),
  staffId: z.string().min(1).nullable(),
  angle: z.number().int().min(1).max(5),
  customerTask: z.string().max(500).nullable().optional(),
  staffTask: z.string().max(500).nullable().optional(),
  dueOverride: z.string().datetime().nullable().optional(),
})

/** ヒアリングシートを登録する。角度から次回追客日が自動で決まる */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)
    const body = parsed.data

    if (!body.customerId && !body.customerName) {
      return jsonError('お客様を選ぶか、名前を入力してください', 400)
    }

    // 一覧に居ない相手（初めて電話した人）でも、その場で登録して追客に入れられる。
    // 「先に顧客を作ってから」を強いると、電話直後の30秒で終わらなくなる
    const customerId =
      body.customerId ??
      (
        await prisma.customer.create({
          data: { name: body.customerName, assigneeId: body.staffId ?? null },
          select: { id: true },
        })
      ).id

    const ctx = await loadBoardContext()
    const result = await addCallMemo(
      {
        customerId,
        calledOn: new Date(body.calledOn),
        staffId: body.staffId,
        angle: body.angle as 1 | 2 | 3 | 4 | 5,
        customerTask: body.customerTask ?? null,
        staffTask: body.staffTask ?? null,
        dueOverride: body.dueOverride ? new Date(body.dueOverride) : null,
        createdById: session.userId,
      },
      ctx,
    )

    return NextResponse.json({
      ok: true,
      customerId,
      dueAt: result.dueAt,
      ended: result.ended,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
