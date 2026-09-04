import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError } from '@/lib/http'
import { listAllSystems, seedDefaultSystems } from '@/lib/services/portal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 初期カードの投入。
 * 既にシステムを構築したあとにポータルを足した環境では初期データが入らないため、
 * 管理画面のボタンから同じ処理を呼べるようにしてある。1件でもあれば何もしない。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('ADMIN')
    assertSameOrigin(request)
    const created = await seedDefaultSystems()
    return NextResponse.json({ ok: true, created, systems: await listAllSystems() })
  } catch (e) {
    return handleApiError(e)
  }
}
