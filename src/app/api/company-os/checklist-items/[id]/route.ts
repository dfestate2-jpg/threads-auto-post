import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany, requireEditor } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { deleteChecklistItem, setChecklistDone } from '@/lib/services/companyOs/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ done: z.boolean() })
type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const { id } = await params
    const { done } = schema.parse(await request.json())
    const item = await setChecklistDone(company.id, id, done)
    if (!item) return NextResponse.json({ error: '項目が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true, data: item })
  } catch (e) {
    return coError(e)
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const { id } = await params
    const removed = await deleteChecklistItem(company.id, id)
    if (!removed) return NextResponse.json({ error: '項目が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return coError(e)
  }
}
