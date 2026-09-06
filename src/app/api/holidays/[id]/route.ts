import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { rescheduleAllAwaiting } from '@/lib/services/conversation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await context.params
    await prisma.businessHoliday.delete({ where: { id } })
    await rescheduleAllAwaiting(await loadPolicyContext())
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
