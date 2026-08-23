import { NextResponse } from 'next/server'

import { getProfile } from '@/lib/line/client'
import { verifyLineSignature } from '@/lib/line/signature'
import type { LineWebhookBody, LineWebhookEvent } from '@/lib/line/types'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { recordInboundMessage, recordOutboundMessage } from '@/lib/services/conversation'
import { ResolvedVia } from '@prisma/client'
import type { PolicyContext } from '@/lib/services/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** イベントの timestamp がこれ以上ずれていたらリプレイとみなして拒否する */
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000

function textOf(event: LineWebhookEvent): string | null {
  const m = event.message
  if (!m) return null
  if (m.type === 'text') return m.text ?? null
  if (m.type === 'sticker') return '[スタンプ]'
  if (m.type === 'image') return '[画像]'
  if (m.type === 'video') return '[動画]'
  if (m.type === 'audio') return '[音声]'
  if (m.type === 'file') return `[ファイル] ${m.fileName ?? ''}`.trim()
  if (m.type === 'location') return '[位置情報]'
  return `[${m.type}]`
}

async function resolveProfile(userId: string): Promise<{ displayName?: string | null; pictureUrl?: string | null } | null> {
  const existing = await prisma.customer.findUnique({
    where: { lineUserId: userId },
    select: { displayName: true },
  })
  if (existing?.displayName) return null // 既に取得済みなら API を叩かない（レート節約）
  try {
    const profile = await getProfile(env.lineChannelAccessToken, userId)
    return profile ? { displayName: profile.displayName, pictureUrl: profile.pictureUrl ?? null } : null
  } catch {
    return null
  }
}

async function handleEvent(event: LineWebhookEvent, ctx: PolicyContext): Promise<void> {
  const userId = event.source?.userId
  // 1対1トーク以外（グループ/ルーム）は顧客対応の対象外
  if (!userId || event.source.type !== 'user') return

  switch (event.type) {
    case 'message': {
      if (!event.message) return
      await recordInboundMessage(
        {
          lineUserId: userId,
          lineMessageId: event.message.id,
          messageType: event.message.type,
          text: textOf(event),
          sentAt: new Date(event.timestamp),
          raw: event as unknown,
          profile: await resolveProfile(userId),
        },
        ctx,
      )
      return
    }
    case 'follow': {
      const profile = await resolveProfile(userId)
      await prisma.customer.upsert({
        where: { lineUserId: userId },
        create: {
          lineUserId: userId,
          displayName: profile?.displayName ?? null,
          pictureUrl: profile?.pictureUrl ?? null,
        },
        update: {
          blocked: false,
          ...(profile?.displayName ? { displayName: profile.displayName } : {}),
        },
      })
      return
    }
    case 'unfollow': {
      // ブロックされた顧客へは通知しても意味がないため、印を付けて送信対象から外す
      await prisma.customer.updateMany({ where: { lineUserId: userId }, data: { blocked: true } })
      return
    }
    /**
     * 拡張ポイント：
     * 標準の Messaging API では「担当者が LINE Official Account Manager から送った返信」は
     * Webhook に配信されない。LINE Module Channel 等でそれを受けられる環境では、
     * 送信イベントをここで OUTBOUND として取り込むことで完全自動判定になる。
     * 詳細は docs/07-line-reply-detection.md を参照。
     */
    case 'send':
    case 'sendMessage': {
      const customer = await prisma.customer.findUnique({ where: { lineUserId: userId }, select: { id: true } })
      if (!customer) return
      const sending = event.sendingMessage ?? event.message
      await recordOutboundMessage(
        {
          customerId: customer.id,
          text: sending?.text ?? null,
          messageType: sending?.type ?? 'text',
          sentAt: new Date(event.timestamp),
          lineMessageId: sending?.id ?? null,
          source: 'LINE_WEBHOOK',
          via: ResolvedVia.WEBHOOK,
          raw: event as unknown,
        },
        ctx,
      )
      return
    }
    default:
      return
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // 署名検証は必ず「生のボディ」に対して行う
  const rawBody = await request.text()
  const signature = request.headers.get('x-line-signature')

  if (!verifyLineSignature(rawBody, signature, env.lineChannelSecret)) {
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

  const ctx = await loadPolicyContext()
  const now = Date.now()

  for (const event of events) {
    try {
      if (Math.abs(now - event.timestamp) > MAX_CLOCK_SKEW_MS && !event.deliveryContext?.isRedelivery) {
        console.warn('[line-webhook] rejected stale event', { type: event.type })
        continue
      }

      // --- 冪等性：同じ webhookEventId は一度しか処理しない ---
      if (event.webhookEventId) {
        try {
          await prisma.webhookEvent.create({
            data: {
              webhookEventId: event.webhookEventId,
              eventType: event.type,
              isRedelivery: event.deliveryContext?.isRedelivery ?? false,
              raw: event as unknown as object,
            },
          })
        } catch {
          continue // 既に処理済み
        }
      }

      await handleEvent(event, ctx)

      if (event.webhookEventId) {
        await prisma.webhookEvent
          .update({ where: { webhookEventId: event.webhookEventId }, data: { processedAt: new Date() } })
          .catch(() => undefined)
      }
    } catch (e) {
      // 1件の失敗で他イベントを落とさない。LINE への再送要求も避け、必ず 200 を返す
      console.error('[line-webhook] event handling failed', { type: event.type, error: String(e) })
    }
  }

  return NextResponse.json({ ok: true })
}

/** LINE Developers の「検証」ボタン用 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true })
}
