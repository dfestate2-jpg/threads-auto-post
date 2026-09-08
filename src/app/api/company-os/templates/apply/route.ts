import { NextResponse } from 'next/server'
import { z } from 'zod'

import { parseDateInput } from '@/lib/company-os/date'
import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany, requireEditor } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { applyTemplate, TemplateError } from '@/lib/services/companyOs/template'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// テンプレートは数十件のタスクを作るため、既定の10秒では足りないことがある
export const maxDuration = 60

const schema = z.object({
  templateKey: z.string().min(1),
  startOn: z.string().nullish(),
  ownerId: z.string().nullish(),
})

/** テンプレートからプロジェクト一式を作る。押し直しても増えない */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const input = schema.parse(await request.json())
    const result = await applyTemplate(company.id, input.templateKey, {
      startOn: parseDateInput(input.startOn ?? null),
      ownerId: input.ownerId ?? ctx.member?.id ?? null,
    })
    return NextResponse.json({ ok: true, data: result }, { status: 201 })
  } catch (e) {
    if (e instanceof TemplateError) return NextResponse.json({ error: e.message }, { status: 400 })
    return coError(e)
  }
}
