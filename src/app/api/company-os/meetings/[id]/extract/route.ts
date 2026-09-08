import { NextResponse } from 'next/server'
import { z } from 'zod'

import { fromDateKey } from '@/lib/company-os/date'
import { extractFromMinutes, type ExtractedItem } from '@/lib/company-os/minutes'
import { assertSameOrigin } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { apiContext, requireCompany, requireEditor } from '@/lib/services/companyOs/context'
import { coError } from '@/lib/services/companyOs/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  /** 確認画面で人が手直しした結果を受け取る。空なら議事録から作り直す */
  items: z
    .array(
      z.object({
        kind: z.enum(['decision', 'task', 'issue', 'question']),
        text: z.string().min(1).max(200),
        assignee: z.string().max(50).nullish(),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      }),
    )
    .optional(),
})

/**
 * 議事録から決定事項・タスク・課題・未決事項を作る。
 *
 * 抽出そのものは GET（プレビュー）で行い、ここでは人が確認した結果だけを保存する。
 * 自動で書き込むと、誤読が気づかれないまま台帳に残ってしまう。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    assertSameOrigin(request)
    const company = requireCompany(ctx)
    requireEditor(ctx)

    const { id } = await params
    const meeting = await prisma.coMeeting.findFirst({ where: { id, companyId: company.id } })
    if (!meeting) return NextResponse.json({ error: '会議が見つかりません' }, { status: 404 })

    const input = schema.parse(await request.json())
    const items: ExtractedItem[] =
      input.items?.map((i) => ({
        kind: i.kind,
        text: i.text,
        assignee: i.assignee ?? null,
        due: i.due ?? null,
      })) ?? extractFromMinutes(meeting.minutes ?? '', meeting.heldAt).items

    if (items.length === 0) {
      return NextResponse.json({ error: '登録できる項目がありませんでした' }, { status: 400 })
    }

    const members = await prisma.coMember.findMany({
      where: { companyId: company.id, active: true },
      select: { id: true, name: true },
    })
    const memberByName = new Map(members.map((m) => [m.name, m.id]))

    const created = { decision: 0, task: 0, issue: 0, question: 0 }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const assigneeId = item.assignee ? (memberByName.get(item.assignee) ?? null) : null
        const dueOn = item.due ? fromDateKey(item.due) : null

        if (item.kind === 'decision') {
          await tx.coDecision.create({
            data: {
              companyId: company.id,
              title: item.text,
              background: `会議「${meeting.title}」で決定`,
              decidedOn: new Date(Date.UTC(meeting.heldAt.getUTCFullYear(), meeting.heldAt.getUTCMonth(), meeting.heldAt.getUTCDate())),
              deciderName: item.assignee ?? null,
              meetingId: meeting.id,
            },
          })
          created.decision += 1
        } else if (item.kind === 'task') {
          await tx.coTask.create({
            data: {
              companyId: company.id,
              title: item.text,
              description: `会議「${meeting.title}」で発生`,
              assigneeId,
              dueOn,
              meetingId: meeting.id,
            },
          })
          created.task += 1
        } else if (item.kind === 'issue') {
          await tx.coIssue.create({
            data: {
              companyId: company.id,
              title: item.text,
              detail: `会議「${meeting.title}」で挙がった課題`,
              ownerId: assigneeId,
              dueOn,
              meetingId: meeting.id,
            },
          })
          created.issue += 1
        } else {
          await tx.coQuestion.create({
            data: {
              companyId: company.id,
              title: item.text,
              point: `会議「${meeting.title}」で保留`,
              ownerId: assigneeId,
              dueOn,
              meetingId: meeting.id,
            },
          })
          created.question += 1
        }
      }
    })

    return NextResponse.json({ ok: true, data: created }, { status: 201 })
  } catch (e) {
    return coError(e)
  }
}

/** 保存せずに、何が抽出されるかだけを返す（確認画面用） */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const ctx = await apiContext()
    const company = requireCompany(ctx)
    const { id } = await params
    const meeting = await prisma.coMeeting.findFirst({ where: { id, companyId: company.id } })
    if (!meeting) return NextResponse.json({ error: '会議が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true, data: extractFromMinutes(meeting.minutes ?? '', meeting.heldAt) })
  } catch (e) {
    return coError(e)
  }
}
