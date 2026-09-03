import { ChannelPurpose, ChannelType } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().min(1).max(80),
  type: z.nativeEnum(ChannelType),
  target: z.string().min(1).max(500),
  purpose: z.nativeEnum(ChannelPurpose),
  enabled: z.boolean().optional(),
})

export async function GET(): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    return NextResponse.json({ channels: await prisma.notificationChannel.findMany({ orderBy: { createdAt: 'asc' } }) })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('通知チャネルの設定が不正です', 400)
    if (parsed.data.type === ChannelType.WEBHOOK && !/^https:\/\//.test(parsed.data.target)) {
      return jsonError('Webhook URL は https:// で始まる必要があります', 400)
    }
    const channel = await prisma.notificationChannel.create({ data: parsed.data })
    return NextResponse.json({ ok: true, channel })
  } catch (e) {
    return handleApiError(e)
  }
}
