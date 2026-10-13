import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { MAX_PAUSE_MINUTES, resolvePause, type PauseRequest } from '@/lib/domain/pauseDuration'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  /** 止める長さ（分）。0 以下 = 今すぐ再開 */
  minutes: z.number().int().min(0).max(MAX_PAUSE_MINUTES).optional(),
  /**
   * end_of_day = 今日いっぱい（タイムゾーン設定基準）
   * indefinite = 「再開」を押すまで止めたまま
   * resume     = 今すぐ再開
   */
  mode: z.enum(['end_of_day', 'indefinite', 'resume']).optional(),
})

function toRequest(minutes: number | undefined, mode: string | undefined): PauseRequest | null {
  if (mode === 'end_of_day') return { kind: 'endOfDay' }
  if (mode === 'indefinite') return { kind: 'indefinite' }
  if (mode === 'resume') return { kind: 'resume' }
  if (minutes !== undefined) return { kind: 'minutes', minutes }
  return null
}

/**
 * リマインド全体を一時停止する／再開する。
 *
 * 止めている間の通知は **消えずに繰り延べられる**。再開後の実行でまとめて送られる。
 *
 * 期限付きの停止は上限24時間。それ以上は「いつ戻るか決まっていない」停止なので
 * `indefinite` を使う。無期限は期限切れで自動復帰しないため、
 * **止めたことを忘れると見逃しが始まる**。停止中は画面の最上部に警告を出し続ける。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    const req = toRequest(parsed.data.minutes, parsed.data.mode)
    if (!req) return jsonError('入力値が不正です', 400)

    const settings = await getSettings()
    const state = resolvePause(req, settings.timezone, new Date())

    /**
     * 再開するときは、期限を「わずかに過去」に置いて出ていく。
     *
     * リマインドのジョブは「期限が入っていた＝直前まで止まっていた」ことを
     * 目印に、再開直後の1回だけ見張り番（配信遅延の検知）を見送る。
     * 無期限停止から戻るときも同じ扱いが要るので、ここで目印を立てる。
     * 止めていたせいで期限を過ぎた分を「遅延」と誤検知させないため。
     */
    const resuming = state.until === null && !state.indefinite
    const wasPaused = settings.remindersPauseIndefinite || settings.remindersPausedUntil !== null

    await prisma.appSettings.update({
      where: { id: 1 },
      data: {
        remindersPausedUntil: resuming && wasPaused ? new Date(Date.now() - 1000) : state.until,
        remindersPauseIndefinite: state.indefinite,
      },
    })

    return NextResponse.json({
      ok: true,
      pausedUntil: state.until?.toISOString() ?? null,
      indefinite: state.indefinite,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
