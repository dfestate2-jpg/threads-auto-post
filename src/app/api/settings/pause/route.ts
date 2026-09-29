import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { MAX_PAUSE_MINUTES, resolvePauseUntil, type PauseRequest } from '@/lib/domain/pauseDuration'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  /** 止める長さ（分）。0 以下 = 今すぐ再開 */
  minutes: z.number().int().min(0).max(MAX_PAUSE_MINUTES).optional(),
  /** 「今日いっぱい」。日付が変わる時刻はタイムゾーン設定に従う */
  mode: z.literal('end_of_day').optional(),
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
    const { minutes, mode } = parsed.data
    if (mode === undefined && minutes === undefined) return jsonError('入力値が不正です', 400)

    // 0 = 再開。押すたびに延びるのではなく、そこで終わりにできる経路を必ず残す
    const req: PauseRequest = mode === 'end_of_day' ? { kind: 'endOfDay' } : { kind: 'minutes', minutes: minutes ?? 0 }
    const settings = await getSettings()
    const until = resolvePauseUntil(req, settings.timezone, new Date())

    await prisma.appSettings.update({ where: { id: 1 }, data: { remindersPausedUntil: until } })
    return NextResponse.json({ ok: true, pausedUntil: until?.toISOString() ?? null })
  } catch (e) {
    return handleApiError(e)
  }
}
