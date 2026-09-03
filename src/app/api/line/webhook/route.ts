import { NextResponse } from 'next/server'

import { verifyLineSignature } from '@/lib/line/signature'
import type { LineWebhookBody } from '@/lib/line/types'
import { env } from '@/lib/env'
import { loadPolicyContext } from '@/lib/services/context'
import { processLineEvents, type ChannelKind } from '@/lib/services/lineWebhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  // 署名検証は必ず「生のボディ」に対して行う
  const rawBody = await request.text()
  const signature = request.headers.get('x-line-signature')

  /**
   * 社内通知Botを別チャネルで運用している場合、「対応済みにする」ボタンの postback は
   * そちらのチャネル署名で届く。どちらか一方でも検証できれば受理し、
   * 応答（reply）には検証できたチャネルのトークンを使う。
   */
  let channel: ChannelKind
  if (verifyLineSignature(rawBody, signature, env.lineChannelSecret)) {
    channel = 'MAIN'
  } else if (
    env.lineNotifyChannelSecret &&
    verifyLineSignature(rawBody, signature, env.lineNotifyChannelSecret)
  ) {
    channel = 'NOTIFY'
  } else {
    console.warn('[line-webhook] signature verification failed')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: LineWebhookBody
  try {
    body = JSON.parse(rawBody) as LineWebhookBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const events = Array.isArray(body.events) ? body.events : []
  if (events.length === 0) return NextResponse.json({ ok: true }) // LINE の疎通確認

  await processLineEvents(events, channel, await loadPolicyContext())

  return NextResponse.json({ ok: true })
}

/** LINE Developers の「検証」ボタン用 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true })
}
