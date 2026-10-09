import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { safeEqual } from '@/lib/line/signature'
import { runCampaignJob } from '@/lib/services/campaignRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 配信キューの消化。**1分ごと**の起動を推奨。
 *
 * 1回あたり MAIL_BATCH_SIZE 件（既定100件）を送るので、
 * 既定設定なら1時間あたり約6,000通。3,000件のリストは30分ほどで送り切る。
 * 起動が数回落ちても、次の起動が残りを拾い直すため送信漏れは起きない。
 */
async function handle(request: Request): Promise<NextResponse> {
  const header = request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!safeEqual(header, env.cronSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runCampaignJob(new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    console.error('[cron] campaign job failed', e)
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
