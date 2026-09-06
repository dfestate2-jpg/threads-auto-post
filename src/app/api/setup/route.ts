import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { buildSessionPayload, setSessionCookie } from '@/lib/auth/session'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { createAdminUser, ensureBaselineData, isSetupPending } from '@/lib/services/bootstrap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().trim().min(1, '氏名を入力してください').max(80),
  email: z.string().trim().email('メールアドレスの形式が正しくありません'),
  password: z
    .string()
    .min(10, 'パスワードは10文字以上にしてください')
    .max(200)
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), '英字と数字の両方を含めてください'),
})

/** セットアップが必要かどうかだけを返す（未認証で叩けるため、他の情報は返さない） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ pending: await isSetupPending(prisma) })
  } catch {
    // DBに繋がらない場合も「未完了」と答えて、セットアップ画面でエラーを見せる
    return NextResponse.json({ pending: true })
  }
}

/**
 * 最初の管理者を作る。【初回セットアップ】
 *
 * **管理画面のユーザーが1人もいないときだけ**動く。
 * 一度でも作られたあとは、この入口から管理者を増やすことはできない。
 * 同時に2回叩かれても片方しか通らないよう、判定と作成を同一トランザクション
 * （Serializable）で行う。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません', 400)
    }

    const created = await prisma.$transaction(
      async (tx) => {
        if (!(await isSetupPending(tx))) return null
        await ensureBaselineData(tx)
        return createAdminUser(tx, parsed.data)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
    )

    if (!created) {
      return jsonError('初期設定は既に完了しています。ログイン画面からお進みください', 409)
    }

    // そのままログインした状態にして、続けて設定に進めるようにする
    await setSessionCookie(buildSessionPayload({ id: created.id, role: 'ADMIN', staffId: created.staffId }))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
