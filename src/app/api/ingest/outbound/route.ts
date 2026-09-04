import { ResolvedVia } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { env } from '@/lib/env'
import { safeEqual } from '@/lib/line/signature'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { recordOutboundMessage } from '@/lib/services/conversation'
import { loadFollowUpContext } from '@/lib/services/followUp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  lineUserId: z.string().min(1),
  text: z.string().nullable().optional(),
  sentAt: z.string().datetime().optional(),
  staffLineUserId: z.string().optional(),
  lineMessageId: z.string().optional(),
})

/**
 * 外部連携からの「担当者が返信した」通知を取り込む。
 *
 * LINE Official Account Manager からの返信は標準 Webhook に流れてこないため、
 * iPaaS / CRM / LINE Module Channel 等の外部システムがそれを検知できる場合に
 * ここへ POST してもらうことで自動的に「対応済み」へ遷移させられる。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = env.ingestSecret
  if (!secret) return NextResponse.json({ error: 'ingest is disabled' }, { status: 404 })

  const header = request.headers.get('x-ingest-secret')
  if (!safeEqual(header, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid payload' }, { status: 400 })

  const { lineUserId, text, sentAt, staffLineUserId, lineMessageId } = parsed.data
  const customer = await prisma.customer.findUnique({ where: { lineUserId }, select: { id: true } })
  if (!customer) return NextResponse.json({ error: 'customer not found' }, { status: 404 })

  const staff = staffLineUserId
    ? await prisma.staff.findUnique({ where: { lineUserId: staffLineUserId }, select: { id: true } })
    : null

  const ctx = await loadPolicyContext()
  const sentInstant = sentAt ? new Date(sentAt) : new Date()
  const result = await recordOutboundMessage(
    {
      customerId: customer.id,
      text: text ?? null,
      sentAt: sentInstant,
      sentByStaffId: staff?.id ?? null,
      lineMessageId: lineMessageId ?? null,
      source: 'INGEST_API',
      via: ResolvedVia.INGEST_API,
    },
    ctx,
    await loadFollowUpContext(sentInstant),
  )
  return NextResponse.json({ ok: true, ...result })
}
