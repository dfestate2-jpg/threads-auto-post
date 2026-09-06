import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { reorderSystems } from '@/lib/services/portal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ ids: z.array(z.string().min(1)).max(200) })

/** 並び替えは「新しい順序の id 配列」を丸ごと受け取る。部分更新にすると順序が壊れやすい */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('ADMIN')
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('並び順の指定が不正です', 400)
    await reorderSystems(parsed.data.ids)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
