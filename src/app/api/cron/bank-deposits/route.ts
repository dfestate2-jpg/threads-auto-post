import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { safeEqual } from '@/lib/line/signature'
import { dispatchNotification } from '@/lib/notify/dispatcher'
import { runDepositSyncJob } from '@/lib/services/depositSync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 銀行入金 → スプレッドシート反映の定期実行エンドポイント。**30分ごと**を推奨。
 *
 * freee 側の銀行同期は1日数回のため、これ以上細かく回しても意味がない。
 * 逆に起動が数回失敗しても、毎回 lookback 日分をさかのぼるため取りこぼしは起きない。
 */

/** 失敗に気付けるよう社内Slackへ流す（設定されている場合のみ・失敗しても無視） */
async function notifyFailure(message: string): Promise<void> {
  const url = env.internalSlackWebhookUrl
  if (!url) return
  try {
    await dispatchNotification(
      [{ channel: 'WEBHOOK', target: url, label: '入金同期', role: 'GROUP' }],
      `【入金同期エラー】銀行入金のスプレッドシート反映に失敗しました。\n${message}`,
    )
  } catch {
    // 通知の失敗でジョブの結果を変えない
  }
}

async function handle(request: Request): Promise<NextResponse> {
  const header =
    request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!safeEqual(header, env.cronSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runDepositSyncJob(new Date())
    if (summary.failed > 0) {
      await notifyFailure(`${summary.failed}件の入金をシートへ書けませんでした（次回再試行します）`)
    }
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[cron] deposit sync failed', e)
    await notifyFailure(message)
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
