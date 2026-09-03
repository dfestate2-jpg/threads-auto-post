import { NextResponse } from 'next/server'

import { authenticateRelay, readPresentedToken } from '@/lib/line/relayAuth'
import { describeShape, extractLineEvents } from '@/lib/line/relayPayload'
import { env } from '@/lib/env'
import { loadPolicyContext } from '@/lib/services/context'
import { processLineEvents, type ChannelKind } from '@/lib/services/lineWebhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lステップの「Webhook転送」の受け口。【Lステップ共存構成】
 *
 * LINE Developers の Webhook URL は **Lステップのまま**にしておき、
 * Lステップが受け取ったイベントをここへ転送してもらう。
 * こうすることで、本システムが停止しても Lステップ の自動応答・シナリオ配信は影響を受けない。
 *
 *   顧客 → LINE公式 → Lステップ（正）→ 転送 → ここ
 *
 * 受け入れ判定は relayAuth に一本化してある（LINE署名 or 転送用トークン）。
 * 処理本体は直接受け取る `/api/line/webhook` と完全に共通。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text()

  const auth = authenticateRelay({
    rawBody,
    signature: request.headers.get('x-line-signature'),
    presentedToken: readPresentedToken(request),
    channelSecret: env.optionalLineChannelSecret,
    notifyChannelSecret: env.lineNotifyChannelSecret,
    expectedToken: env.lstepRelayToken,
  })

  if (!auth.ok) {
    console.warn('[line-relay] 受理しませんでした', { reason: auth.reason })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody) as unknown
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const events = extractLineEvents(body)

  /**
   * 転送形式が想定と違うと、ここで静かに0件になる = 未返信を丸ごと取りこぼす。
   * それが最悪なので、0件のときは必ず「何が届いたか」を形だけログに残す（値は出さない）。
   * 導入直後のテスト送信では LSTEP_RELAY_DEBUG=1 にして、成功時も形を確認する。
   */
  if (events.length === 0) {
    console.warn('[line-relay] イベントを取り出せませんでした', {
      via: auth.via,
      shape: describeShape(body),
    })
    // 転送元に再送させても形は変わらないので 200 を返す
    return NextResponse.json({ ok: true, accepted: 0 })
  }

  if (env.lstepRelayDebug) {
    console.info('[line-relay] 受信', {
      via: auth.via,
      hasSignature: request.headers.get('x-line-signature') !== null,
      shape: describeShape(body),
      eventTypes: events.map((e) => e.type),
    })
  }

  const channel: ChannelKind = auth.via === 'LINE_SIGNATURE' ? auth.channel : 'MAIN'
  await processLineEvents(events, channel, await loadPolicyContext())

  return NextResponse.json({ ok: true, accepted: events.length })
}

/** 転送先を登録するときの疎通確認用 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true })
}
