import { NextResponse } from 'next/server'

import { loadBoardContext } from '@/lib/board/settings'
import { runBoardJob } from '@/lib/board/runner'
import { env } from '@/lib/env'
import { safeEqual } from '@/lib/line/signature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 追客ボードの定期実行。1時間おきの起動を想定。
 *
 * 期限を過ぎたぶんもまとめて拾うので、起動が飛んでも追客漏れにはならない。
 * リマインド（/api/cron/reminders）とは別の口で、互いに影響しない。
 */
async function handle(request: Request): Promise<NextResponse> {
  const header =
    request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!safeEqual(header, env.cronSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const ctx = await loadBoardContext(new Date())
    const summary = await runBoardJob(ctx)
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    console.error('[cron] board job failed', e)
    return NextResponse.json({ ok: false, error: 'job failed' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request)
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request)
}
