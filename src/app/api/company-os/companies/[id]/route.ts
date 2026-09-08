import { NextResponse } from 'next/server'

import { assertSameOrigin } from '@/lib/http'
import { companySchema, serializeCompany, updateCompany } from '@/lib/services/companyOs/company'
import { apiContext, requireCompanyAdmin } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 会社情報の更新。
 * 会社は他のリソースと違い「いま見ている会社」以外も指定しうるため、
 * 汎用ルートには載せず、対象の存在確認をしたうえで個別に扱う。
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    requireCompanyAdmin(ctx)

    const { id } = await params
    const target = await prisma.coCompany.findUnique({ where: { id }, select: { id: true } })
    if (!target) return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 })

    const input = companySchema.partial().parse(await request.json())
    const updated = await updateCompany(id, input)
    return NextResponse.json({ ok: true, data: serializeCompany(updated) })
  } catch (e) {
    return coError(e)
  }
}
