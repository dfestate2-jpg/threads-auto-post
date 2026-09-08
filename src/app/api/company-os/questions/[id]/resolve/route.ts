import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany, requireEditor } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { resolveQuestion } from '@/lib/services/companyOs/management'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().min(1, '決定内容を入力してください').max(300),
  reason: z.string().max(4000).nullish(),
  decidedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '決定日を選んでください'),
  deciderId: z.string().nullish(),
  deciderName: z.string().max(100).nullish(),
})

/**
 * 未決事項を「決まった」ことにする。
 * 意思決定を1件作り、未決事項をそこへ結びつける（手で二重入力させない）。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const { id } = await params
    const input = schema.parse(await request.json())
    const decision = await resolveQuestion(company.id, id, {
      title: input.title,
      reason: input.reason?.trim() || null,
      decidedOn: new Date(`${input.decidedOn}T00:00:00.000Z`),
      deciderId: input.deciderId || ctx.member?.id || null,
      deciderName: input.deciderName?.trim() || ctx.userName,
    })
    if (!decision) return NextResponse.json({ error: '未決事項が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true, data: decision }, { status: 201 })
  } catch (e) {
    return coError(e)
  }
}
