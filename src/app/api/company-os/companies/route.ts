import { NextResponse } from 'next/server'

import { assertSameOrigin } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { companySchema, createCompany, serializeCompany, updateCompany } from '@/lib/services/companyOs/company'
import { apiContext, COMPANY_COOKIE, requireCompany, requireCompanyAdmin } from '@/lib/services/companyOs/context'
import { ensureDashboardMetrics } from '@/lib/services/companyOs/dashboard'
import { coError } from '@/lib/services/companyOs/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 会社を作る。作った人がそのまま経営者になり、経営数値の器も用意される */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)

    const input = companySchema.parse(await request.json())
    const user = await prisma.user.findUnique({
      where: { id: ctx.session.userId },
      select: { name: true, email: true },
    })
    const company = await createCompany(input, {
      userId: ctx.session.userId,
      name: user?.name ?? 'オーナー',
      email: user?.email ?? null,
    })
    await ensureDashboardMetrics(company.id)

    const response = NextResponse.json({ ok: true, data: serializeCompany(company) }, { status: 201 })
    // 作った会社をそのまま開けるようにする
    response.cookies.set(COMPANY_COOKIE, company.id, { httpOnly: true, sameSite: 'lax', path: '/' })
    return response
  } catch (e) {
    return coError(e)
  }
}

/** 会社情報の更新。触れるのは管理者だけ */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireCompanyAdmin(ctx)

    const input = companySchema.partial().parse(await request.json())
    const updated = await updateCompany(company.id, input)
    return NextResponse.json({ ok: true, data: serializeCompany(updated) })
  } catch (e) {
    return coError(e)
  }
}
