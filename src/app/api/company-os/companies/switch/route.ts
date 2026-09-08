import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertSameOrigin } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { apiContext, COMPANY_COOKIE } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ companyId: z.string().min(1) })

/** 見ている会社を切り替える。存在しないIDは受け付けない */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await apiContext()
    assertSameOrigin(request)
    const { companyId } = schema.parse(await request.json())

    const company = await prisma.coCompany.findFirst({
      where: { id: companyId, archived: false },
      select: { id: true },
    })
    if (!company) return NextResponse.json({ error: '会社が見つかりません' }, { status: 404 })

    const response = NextResponse.json({ ok: true })
    response.cookies.set(COMPANY_COOKIE, company.id, { httpOnly: true, sameSite: 'lax', path: '/' })
    return response
  } catch (e) {
    return coError(e)
  }
}
