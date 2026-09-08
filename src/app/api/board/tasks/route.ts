import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { loadBoardContext } from '@/lib/board/settings'
import { instantAtDayMinutes } from '@/lib/domain/time'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().min(1).max(200),
  /** YYYY-MM-DD。省略すると今日 */
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** 誰のタスクか。省略すると自分 */
  staffId: z.string().min(1).nullable().optional(),
})

/**
 * 顧客と関係のない自分のタスクを足す。
 *
 * 今日やることが追客だけだと、それ以外を別の場所で管理することになり、
 * 見る場所が2つに割れる。割れた時点で片方は必ず見られなくなる。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireApiSession('STAFF')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('やることを入力してください', 400)
    const body = parsed.data

    const ctx = await loadBoardContext()
    // 日付は「その日の0時（日本時間）」で持つ。時刻の差で前日にずれないようにする
    const dueOn = body.dueOn
      ? instantAtDayMinutes(body.dueOn, 0, ctx.timezone)
      : instantAtDayMinutes(new Intl.DateTimeFormat('sv-SE', { timeZone: ctx.timezone }).format(ctx.now), 0, ctx.timezone)

    const task = await prisma.boardTask.create({
      data: {
        title: body.title.trim(),
        dueOn,
        staffId: body.staffId === undefined ? session.staffId : body.staffId,
        createdById: session.userId,
      },
    })

    return NextResponse.json({ ok: true, task })
  } catch (e) {
    return handleApiError(e)
  }
}
