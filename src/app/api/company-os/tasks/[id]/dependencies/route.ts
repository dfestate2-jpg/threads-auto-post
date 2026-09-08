import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany, requireEditor } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { addDependency, removeDependency } from '@/lib/services/companyOs/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ dependsOnId: z.string().min(1) })
type Params = { params: Promise<{ id: string }> }

/** 先行タスクを追加する。循環する組み合わせは 400 で断る */
export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const { id } = await params
    const { dependsOnId } = schema.parse(await request.json())
    const problem = await addDependency(company.id, id, dependsOnId)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    return NextResponse.json({ ok: true }, { status: 201 })
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
    const { dependsOnId } = schema.parse(await request.json())
    const removed = await removeDependency(company.id, id, dependsOnId)
    if (!removed) return NextResponse.json({ error: '依存関係が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return coError(e)
  }
}
