import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { safeEqual } from '@/lib/line/signature'
import { runReminderJob } from '@/lib/services/reminderRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 定期実行エンドポイント。**5分ごと**の起動を推奨。
 *
 * 「1時間ごとにちょうど起動する」設計にはしていない。
 * 期限（nextReminderAt）を過ぎたものを毎回まとめて処理するため、
 * 起動が数回失敗しても次の起動で確実に回収され、通知漏れが起きない。
 */
async function handle(request: Request): Promise<NextResponse> {
  const header = request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!safeEqual(header, env.cronSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runReminderJob(new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    console.error('[cron] reminder job failed', e)
    return NextResponse.json({ ok: false, error: 'job failed' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request)
}

/** Vercel Cron / Netlify Scheduled Functions は GET で叩くため両方受ける */
export async function GET(request: Request): Promise<NextResponse> {
  return handle(request)
}
