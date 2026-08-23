import { NextResponse } from 'next/server'
import { z } from 'zod'

import { verifyPassword } from '@/lib/auth/password'
import { buildSessionPayload, setSessionCookie } from '@/lib/auth/session'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })

const MAX_FAILED = 5
const LOCK_MINUTES = 15

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('メールアドレスとパスワードを入力してください', 400)

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
    // 存在しないユーザーでも同じ応答を返し、アカウントの有無を推測させない
    const generic = 'メールアドレスまたはパスワードが正しくありません'
    if (!user || !user.active) return jsonError(generic, 401)

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return jsonError('ログイン試行が続いたため一時的にロックされています。しばらく待って再度お試しください', 429)
    }

    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      const failed = user.failedLoginCount + 1
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      })
      return jsonError(generic, 401)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    })
    await setSessionCookie(buildSessionPayload({ id: user.id, role: user.role, staffId: user.staffId }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
