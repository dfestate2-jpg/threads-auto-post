import { NextResponse } from 'next/server'
import { z } from 'zod'

import { answer } from '@/lib/company-os/advisor'
import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { buildSnapshot } from '@/lib/services/companyOs/snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ question: z.string().min(1, '質問を入力してください').max(500) })

/**
 * AI経営アシスタントへの質問。
 *
 * Phase1 は会社データを読み取ったうえでルールが答える（外部に何も送らない）。
 * Phase3 で言語モデルに切り替えるときも、この入口と戻り値の形は変えない。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)

    const { question } = schema.parse(await request.json())
    const snapshot = await buildSnapshot(company, ctx.role, new Date())
    const result = answer(question, snapshot)

    return NextResponse.json({
      ok: true,
      data: {
        text: result.text,
        findings: result.findings.slice(0, 5),
        tasks: result.tasks.map((t) => ({ id: t.id, title: t.title, reasons: t.reasons, overdueDays: t.overdueDays })),
      },
    })
  } catch (e) {
    return coError(e)
  }
}
