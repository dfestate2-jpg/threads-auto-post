import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany, requireEditor } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { addChecklistItem } from '@/lib/services/companyOs/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ label: z.string().min(1, 'チェック項目を入力してください').max(200) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const { id } = await params
    const { label } = schema.parse(await request.json())
    const item = await addChecklistItem(company.id, id, label)
    if (!item) return NextResponse.json({ error: 'タスクが見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true, data: item }, { status: 201 })
  } catch (e) {
    return coError(e)
  }
}
