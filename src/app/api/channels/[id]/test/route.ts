import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { dispatchNotification } from '@/lib/notify/dispatcher'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 通知先の設定ミスを本番の未返信で気付くことのないよう、テスト送信を用意する */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    const channel = await prisma.notificationChannel.findUnique({ where: { id } })
    if (!channel) return jsonError('通知チャネルが見つかりません', 404)

    const { results, anySucceeded } = await dispatchNotification(
      [{ channel: channel.type, target: channel.target, label: channel.name, role: 'GROUP' }],
      '✅ 未返信リマインドシステムのテスト送信です。このメッセージが届いていれば通知設定は正常です。',
    )
    return NextResponse.json({ ok: anySucceeded, results: results.map((r) => ({ ok: r.ok, error: r.error ?? null })) })
  } catch (e) {
    return handleApiError(e)
  }
}
