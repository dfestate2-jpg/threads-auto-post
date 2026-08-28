/** 送信中の配信の一時停止・再開。誤爆に気づいたときに即座に止められるようにする */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { pauseCampaign, resumeCampaign } from '@/lib/services/campaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ action: z.enum(['pause', 'resume']) })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('操作が不正です', 400)

    const ok =
      parsed.data.action === 'pause' ? await pauseCampaign(id) : await resumeCampaign(id)
    if (!ok) return jsonError('この配信は現在その操作を行えません', 409)

    return NextResponse.json({
      ok: true,
      // 確保済みの数件は止めきれないことを、UI で正直に伝えるためのフラグ
      note:
        parsed.data.action === 'pause'
          ? '停止しました。直前に送信処理へ入った数件は届く場合があります。'
          : '再開しました。次の定期実行から送信を続けます。',
    })
  } catch (e) {
    return handleApiError(e)
  }
}
