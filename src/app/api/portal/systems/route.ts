import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { PortalInputError, createSystem, listAllSystems, systemSchema } from '@/lib/services/portal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ポータルに並べるシステムの登録。
 * 変更できるのは管理者だけ（トップページの内容は全社員に見えるため）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireApiSession('ADMIN')
    return NextResponse.json({ systems: await listAllSystems() })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('ADMIN')
    assertSameOrigin(request)
    const parsed = systemSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力内容を確認してください', 400)
    const system = await createSystem(parsed.data)
    return NextResponse.json({ ok: true, system })
  } catch (e) {
    if (e instanceof PortalInputError) return jsonError(e.message, 400)
    return handleApiError(e)
  }
}
