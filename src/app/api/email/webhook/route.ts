/**
 * 送信プロバイダからのバウンス・苦情通知の受け口。
 *
 * これを繋がないと、宛先不明のアドレスに送り続けることになり、
 * バウンス率が上がってドメイン全体の到達率が落ちる。
 * Gmail は苦情率 0.3% を超えると受信を絞るため、苦情の即時反映は必須。
 *
 * 設定するURL:
 *   Resend   … Webhooks に https://<host>/api/email/webhook?token=<MAIL_WEBHOOK_SECRET>
 *   SendGrid … Event Webhook に同上
 */
import { SuppressionReason } from '@prisma/client'
import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { safeEqual } from '@/lib/line/signature'
import { recordBounce, type BounceReason } from '@/lib/services/contacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** プロバイダごとにイベント名が違うので、ここで意味に寄せる */
function classify(type: string): BounceReason | null {
  const t = type.toLowerCase()
  if (t.includes('complaint') || t.includes('spamreport')) return SuppressionReason.COMPLAINED
  // ソフトバウンス（一時的な不達）は台帳に載せない。再送で届くことがあるため
  if (t.includes('bounce') && !t.includes('soft')) return SuppressionReason.BOUNCED
  if (t === 'dropped' || t === 'blocked') return SuppressionReason.BOUNCED
  return null
}

interface IncomingEvent {
  type?: string
  event?: string
  email?: string
  data?: { email?: string; to?: string[] | string }
}

function addressOf(e: IncomingEvent): string | null {
  if (typeof e.email === 'string') return e.email
  if (typeof e.data?.email === 'string') return e.data.email
  const to = e.data?.to
  if (Array.isArray(to)) return to[0] ?? null
  if (typeof to === 'string') return to
  return null
}

export async function POST(request: Request): Promise<NextResponse> {
  // 署名検証はプロバイダごとに方式が違うため、URL に共有トークンを載せる方式で統一する
  const token = new URL(request.url).searchParams.get('token')
  if (!env.mailWebhookSecret || !safeEqual(token, env.mailWebhookSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Resend は単一オブジェクト、SendGrid は配列で送ってくる
  const events: IncomingEvent[] = Array.isArray(payload) ? payload : [payload as IncomingEvent]
  let applied = 0

  for (const event of events.slice(0, 500)) {
    const reason = classify(String(event.type ?? event.event ?? ''))
    const address = addressOf(event)
    if (!reason || !address) continue
    try {
      await recordBounce(address, reason, `プロバイダ通知: ${event.type ?? event.event}`)
      applied++
    } catch (e) {
      console.error('[mail-webhook] failed to apply event', e)
    }
  }

  // 失敗を返すとプロバイダが再送し続けるため、受領自体は常に 200 で返す
  return NextResponse.json({ ok: true, received: events.length, applied })
}
