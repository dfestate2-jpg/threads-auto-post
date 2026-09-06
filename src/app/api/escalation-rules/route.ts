import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { rescheduleAllAwaiting } from '@/lib/services/conversation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const rule = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  thresholdMinutes: z.number().int().min(1).max(20160),
  notifyAssignee: z.boolean(),
  notifyManager: z.boolean(),
  notifyAdmins: z.boolean(),
  notifyGroup: z.boolean(),
  enabled: z.boolean(),
})

export async function GET(): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    return NextResponse.json({ rules: await prisma.escalationRule.findMany({ orderBy: { thresholdMinutes: 'asc' } }) })
  } catch (e) {
    return handleApiError(e)
  }
}

/** エスカレーション設定をまとめて置き換える */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const parsed = z.object({ rules: z.array(rule).max(20) }).safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('エスカレーション設定が不正です', 400)

    const thresholds = parsed.data.rules.map((r) => r.thresholdMinutes)
    if (new Set(thresholds).size !== thresholds.length) {
      return jsonError('同じ経過時間のルールを複数登録することはできません', 400)
    }

    await prisma.$transaction([
      prisma.escalationRule.deleteMany({}),
      prisma.escalationRule.createMany({
        data: parsed.data.rules.map((r, i) => ({
          name: r.name,
          thresholdMinutes: r.thresholdMinutes,
          notifyAssignee: r.notifyAssignee,
          notifyManager: r.notifyManager,
          notifyAdmins: r.notifyAdmins,
          notifyGroup: r.notifyGroup,
          enabled: r.enabled,
          sortOrder: i,
        })),
      }),
    ])

    // 閾値が変わるとリマインド予定も変わるため引き直す
    const rescheduled = await rescheduleAllAwaiting(await loadPolicyContext())
    return NextResponse.json({ ok: true, rescheduled })
  } catch (e) {
    return handleApiError(e)
  }
}
