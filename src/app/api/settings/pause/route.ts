import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 止めすぎの歯止め。これ以上は祝日・臨時休業日の設定で表現すべき範囲 */
const MAX_PAUSE_MINUTES = 24 * 60

const schema = z.object({
  /** 止める長さ（分）。0 以下 = 今すぐ再開 */
  minutes: z.number().int().min(0).max(MAX_PAUSE_MINUTES),
})

/**
 * リマインド全体を一時停止する／再開する。
 *
 * **必ず期限を持たせる。** 無期限に止められると、止めたことを忘れた時点で
 * 「未返信を見逃さない」という仕組みそのものが静かに死ぬ。
 * 上限を24時間にしてあるのも同じ理由で、それ以上は臨時休業日として登録すべき。
 *
 * 止めている間の通知は **消えずに繰り延べられる**。再開後の実行でまとめて送られる。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    // 0 = 再開。押すたびに延びるのではなく、そこで終わりにできる経路を必ず残す
    if (parsed.data.minutes <= 0) {
      await prisma.appSettings.update({ where: { id: 1 }, data: { remindersPausedUntil: null } })
      return NextResponse.json({ ok: true, pausedUntil: null })
    }

    const until = new Date(Date.now() + parsed.data.minutes * 60_000)
    await prisma.appSettings.update({ where: { id: 1 }, data: { remindersPausedUntil: until } })
    return NextResponse.json({ ok: true, pausedUntil: until.toISOString() })
  } catch (e) {
    return handleApiError(e)
  }
}
