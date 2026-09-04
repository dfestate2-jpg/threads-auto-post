import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { PortalInputError, deleteSystem, setPublished, systemSchema, updateSystem } from '@/lib/services/portal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 公開/非公開の切り替えだけは、全項目を送らなくても済むようにしてある */
const patchSchema = z.union([systemSchema, z.object({ published: z.boolean() }).strict()])

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('ADMIN')
    assertSameOrigin(request)
    const { id } = await context.params
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力内容を確認してください', 400)

    const body = parsed.data
    const system = 'name' in body ? await updateSystem(id, body) : await setPublished(id, body.published)
    return NextResponse.json({ ok: true, system })
  } catch (e) {
    if (e instanceof PortalInputError) return jsonError(e.message, 400)
    return handleApiError(e)
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('ADMIN')
    assertSameOrigin(request)
    const { id } = await context.params
    await deleteSystem(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
