import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { loadPolicyContext } from '@/lib/services/context'
import { rescheduleAllAwaiting } from '@/lib/services/conversation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(80),
  /** true = 臨時営業日 / false = 休業日 */
  isOpen: z.boolean().optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('休業日の指定が不正です', 400)

    const holiday = await prisma.businessHoliday.upsert({
      where: { date: new Date(`${parsed.data.date}T00:00:00Z`) },
      create: {
        date: new Date(`${parsed.data.date}T00:00:00Z`),
        name: parsed.data.name,
        isOpen: parsed.data.isOpen ?? false,
      },
      update: { name: parsed.data.name, isOpen: parsed.data.isOpen ?? false },
    })
    await rescheduleAllAwaiting(await loadPolicyContext())
    return NextResponse.json({ ok: true, holiday })
  } catch (e) {
    return handleApiError(e)
  }
}
