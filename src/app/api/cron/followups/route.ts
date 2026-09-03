import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { safeEqual } from '@/lib/line/signature'
import { runFollowUpJob } from '@/lib/services/followUpRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 追客の定期実行エンドポイント。**1日数回**（例：毎時）の起動を想定。
 *
 * 未返信リマインド（/api/cron/reminders）が「分単位の即応」を担当するのに対し、
 * こちらは「日単位の追客」を担当する。
 * 期限を過ぎた分をまとめて処理するため、起動が飛んでも追客漏れにはならない。
 */
async function handle(request: Request): Promise<NextResponse> {
  const header = request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!safeEqual(header, env.cronSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runFollowUpJob(new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    console.error('[cron] follow-up job failed', e)
    return NextResponse.json({ ok: false, error: 'job failed' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request)
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request)
}
