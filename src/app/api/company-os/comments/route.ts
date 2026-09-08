import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany, requireEditor } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'
import { addComment } from '@/lib/services/companyOs/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    taskId: z.string().nullish(),
    issueId: z.string().nullish(),
    body: z.string().min(1, 'コメントを入力してください').max(4000),
  })
  .refine((v) => Boolean(v.taskId) !== Boolean(v.issueId), {
    message: 'コメント先はタスクか課題のどちらか一方を指定してください',
  })

/** タスク・課題へのコメント。投稿者名は投稿時点の名前を残す */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const input = schema.parse(await request.json())
    const comment = await addComment(
      company.id,
      { taskId: input.taskId ?? undefined, issueId: input.issueId ?? undefined },
      { id: ctx.member?.id ?? null, name: ctx.userName },
      input.body,
    )
    if (!comment) return NextResponse.json({ error: 'コメント先が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true, data: comment }, { status: 201 })
  } catch (e) {
    return coError(e)
  }
}
