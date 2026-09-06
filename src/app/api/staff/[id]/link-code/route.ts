import { NextResponse } from 'next/server'

import { requireApiSession } from '@/lib/auth/guard'
import { formatLinkCode } from '@/lib/domain/linkCode'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { issueLinkCode } from '@/lib/services/staffLink'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 担当者のLINE連携コードを発行する。
 * 平文はこの応答でしか返さない（DBにはハッシュのみ）。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)
    const { id } = await params

    const staff = await prisma.staff.findUnique({ where: { id }, select: { id: true, name: true, active: true } })
    if (!staff) return jsonError('担当者が見つかりません', 404)
    if (!staff.active) return jsonError('無効な担当者にはコードを発行できません', 400)

    const issued = await issueLinkCode(staff.id)
    return NextResponse.json({
      ok: true,
      code: issued.code,
      display: formatLinkCode(issued.code),
      expiresAt: issued.expiresAt.toISOString(),
    })
  } catch (e) {
    return handleApiError(e)
  }
}
