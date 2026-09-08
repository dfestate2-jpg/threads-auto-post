/**
 * 経営まわり（経営課題・意思決定・未決事項・会議ログ・経営目標）。
 *
 * この4つは互いに行き来する。
 *   会議 → 決定 / 未決事項 / 課題 / タスク
 *   課題 → 対策タスク
 *   未決事項 → 決定
 * 相互のリンクを張る処理をここにまとめ、画面はどこからでも同じ形で辿れるようにする。
 */
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { visibilityFilter } from '@/lib/company-os/access'
import type { CoRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { dateField, dateTimeField, idRef, optionalText, requiredText } from './input'

const AREA = z.enum([
  'COMPANY', 'LEGAL', 'MANAGEMENT', 'BUSINESS', 'SALES', 'CUSTOMER',
  'DEVELOPMENT', 'SUBSIDY', 'MA', 'FINANCE', 'HR', 'OTHER',
])
const SEVERITY = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
const VISIBILITY = z.enum(['ALL', 'MANAGERS', 'OWNERS'])

// ---------------------------------------------------------------------------
// 経営課題
// ---------------------------------------------------------------------------

export const issueSchema = z.object({
  title: requiredText(200, '課題名'),
  detail: optionalText(4000),
  severity: SEVERITY.default('MEDIUM'),
  status: z.enum(['OPEN', 'INVESTIGATING', 'ACTING', 'RESOLVED', 'ON_HOLD']).default('OPEN'),
  area: AREA.default('MANAGEMENT'),
  occurredOn: dateField,
  dueOn: dateField,
  ownerId: idRef,
  projectId: idRef,
  meetingId: idRef,
  cause: optionalText(2000),
  countermeasure: optionalText(2000),
  nextAction: optionalText(500),
  visibility: VISIBILITY.default('ALL'),
})

export type IssueInput = z.infer<typeof issueSchema>

const issueInclude = {
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  meeting: { select: { id: true, title: true } },
  _count: { select: { tasks: true, comments: true } },
} satisfies Prisma.CoIssueInclude

export async function listIssues(
  companyId: string,
  role: CoRole,
  filters: { status?: string; severity?: string; includeResolved?: boolean } = {},
) {
  const where: Prisma.CoIssueWhereInput = { companyId, ...visibilityFilter(role) }
  if (filters.status) where.status = filters.status as Prisma.CoIssueWhereInput['status']
  else if (!filters.includeResolved) where.status = { notIn: ['RESOLVED'] }
  if (filters.severity) where.severity = filters.severity as Prisma.CoIssueWhereInput['severity']

  return prisma.coIssue.findMany({
    where,
    include: issueInclude,
    orderBy: [
      { severity: 'asc' }, // CRITICAL → LOW（enum の定義順）
      { dueOn: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  })
}

export async function getIssue(companyId: string, role: CoRole, id: string) {
  return prisma.coIssue.findFirst({
    where: { id, companyId, ...visibilityFilter(role) },
    include: {
      ...issueInclude,
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      comments: { orderBy: { createdAt: 'asc' } },
      decisions: { select: { id: true, title: true, decidedOn: true } },
    },
  })
}

export async function createIssue(companyId: string, input: IssueInput) {
  return prisma.coIssue.create({ data: { companyId, ...input }, include: issueInclude })
}

export async function updateIssue(companyId: string, id: string, input: Partial<IssueInput>) {
  const current = await prisma.coIssue.findFirst({ where: { id, companyId }, select: { status: true } })
  if (!current) return null
  const data: Prisma.CoIssueUpdateInput = { ...(input as Prisma.CoIssueUpdateInput) }
  if (input.status && input.status !== current.status) {
    data.resolvedAt = input.status === 'RESOLVED' ? new Date() : null
  }
  return prisma.coIssue.update({ where: { id }, data, include: issueInclude })
}

export async function deleteIssue(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coIssue.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

// ---------------------------------------------------------------------------
// 意思決定
// ---------------------------------------------------------------------------

export const decisionSchema = z.object({
  title: requiredText(300, '決定事項'),
  background: optionalText(4000),
  reason: optionalText(4000),
  decidedOn: z
    .string()
    .min(1, '決定日を入力してください')
    .transform((v, ctx) => {
      const parsed = Date.parse(`${v}T00:00:00.000Z`)
      if (Number.isNaN(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '決定日の形式が正しくありません' })
        return z.NEVER
      }
      return new Date(parsed)
    }),
  deciderId: idRef,
  deciderName: optionalText(100),
  area: AREA.default('MANAGEMENT'),
  important: z.boolean().default(false),
  visibility: VISIBILITY.default('ALL'),
  projectId: idRef,
  issueId: idRef,
  meetingId: idRef,
})

export type DecisionInput = z.infer<typeof decisionSchema>

const decisionInclude = {
  decider: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  issue: { select: { id: true, title: true } },
  meeting: { select: { id: true, title: true } },
  revisions: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.CoDecisionInclude

export async function listDecisions(
  companyId: string,
  role: CoRole,
  filters: { important?: boolean; q?: string } = {},
) {
  const where: Prisma.CoDecisionWhereInput = { companyId, ...visibilityFilter(role) }
  if (filters.important) where.important = true
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { background: { contains: filters.q, mode: 'insensitive' } },
      { reason: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  return prisma.coDecision.findMany({
    where,
    include: decisionInclude,
    orderBy: [{ decidedOn: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function getDecision(companyId: string, role: CoRole, id: string) {
  return prisma.coDecision.findFirst({ where: { id, companyId, ...visibilityFilter(role) }, include: decisionInclude })
}

export async function createDecision(companyId: string, input: DecisionInput) {
  return prisma.coDecision.create({ data: { companyId, ...input }, include: decisionInclude })
}

/**
 * 決定の書き換えは履歴に残す。
 * 「いつの間にか決定内容が変わっていた」を防ぐことが、この機能の目的そのもの。
 */
export async function updateDecision(
  companyId: string,
  id: string,
  input: Partial<DecisionInput>,
  changedBy: string,
) {
  const current = await prisma.coDecision.findFirst({ where: { id, companyId } })
  if (!current) return null

  const changed: string[] = []
  if (input.title !== undefined && input.title !== current.title) changed.push('決定事項')
  if (input.background !== undefined && input.background !== current.background) changed.push('背景')
  if (input.reason !== undefined && input.reason !== current.reason) changed.push('理由')
  if (input.decidedOn !== undefined && input.decidedOn.getTime() !== current.decidedOn.getTime()) changed.push('決定日')

  return prisma.$transaction(async (tx) => {
    if (changed.length > 0) {
      await tx.coDecisionRevision.create({
        data: {
          decisionId: id,
          summary: `${changed.join('・')}を変更`,
          before: [current.title, current.background, current.reason].filter(Boolean).join('\n\n'),
          changedBy,
        },
      })
    }
    return tx.coDecision.update({ where: { id }, data: input, include: decisionInclude })
  })
}

export async function deleteDecision(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coDecision.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

// ---------------------------------------------------------------------------
// 未決事項
// ---------------------------------------------------------------------------

export const questionOptionSchema = z.object({
  label: z.string().max(200),
  pros: z.string().max(1000).optional().default(''),
  cons: z.string().max(1000).optional().default(''),
})

export const questionSchema = z.object({
  title: requiredText(200, '未決事項'),
  point: optionalText(4000),
  options: z.array(questionOptionSchema).max(10).default([]),
  recommendation: optionalText(2000),
  status: z.enum(['OPEN', 'DISCUSSING', 'DECIDED', 'DEFERRED']).default('OPEN'),
  severity: SEVERITY.default('MEDIUM'),
  area: AREA.default('MANAGEMENT'),
  dueOn: dateField,
  ownerId: idRef,
  projectId: idRef,
  meetingId: idRef,
})

export type QuestionInput = z.infer<typeof questionSchema>
export type QuestionOption = z.infer<typeof questionOptionSchema>

const questionInclude = {
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  decision: { select: { id: true, title: true } },
} satisfies Prisma.CoQuestionInclude

export async function listQuestions(companyId: string, filters: { includeDecided?: boolean } = {}) {
  const where: Prisma.CoQuestionWhereInput = { companyId }
  if (!filters.includeDecided) where.status = { notIn: ['DECIDED'] }
  return prisma.coQuestion.findMany({
    where,
    include: questionInclude,
    orderBy: [{ severity: 'asc' }, { dueOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  })
}

export async function getQuestion(companyId: string, id: string) {
  return prisma.coQuestion.findFirst({ where: { id, companyId }, include: questionInclude })
}

export async function createQuestion(companyId: string, input: QuestionInput) {
  return prisma.coQuestion.create({
    data: { companyId, ...input, options: input.options as unknown as Prisma.InputJsonValue },
    include: questionInclude,
  })
}

export async function updateQuestion(companyId: string, id: string, input: Partial<QuestionInput>) {
  const found = await prisma.coQuestion.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!found) return null
  const data: Prisma.CoQuestionUpdateInput = { ...(input as Prisma.CoQuestionUpdateInput) }
  if (input.options) data.options = input.options as unknown as Prisma.InputJsonValue
  return prisma.coQuestion.update({ where: { id }, data, include: questionInclude })
}

export async function deleteQuestion(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coQuestion.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

/**
 * 未決事項を「決まった」ことにする。
 * 意思決定を1件作り、未決事項からそこへリンクを張って決定済みにする。
 * 手で両方に入力させると、片方だけ更新されて食い違う。
 */
export async function resolveQuestion(
  companyId: string,
  id: string,
  input: { title: string; reason: string | null; decidedOn: Date; deciderId: string | null; deciderName: string | null },
) {
  const question = await prisma.coQuestion.findFirst({ where: { id, companyId } })
  if (!question) return null

  return prisma.$transaction(async (tx) => {
    const decision = await tx.coDecision.create({
      data: {
        companyId,
        title: input.title,
        background: question.point,
        reason: input.reason,
        decidedOn: input.decidedOn,
        deciderId: input.deciderId,
        deciderName: input.deciderName,
        area: question.area,
        important: question.severity === 'CRITICAL' || question.severity === 'HIGH',
        projectId: question.projectId,
        meetingId: question.meetingId,
      },
    })
    await tx.coQuestion.update({ where: { id }, data: { status: 'DECIDED', decisionId: decision.id } })
    return decision
  })
}

// ---------------------------------------------------------------------------
// 会議ログ
// ---------------------------------------------------------------------------

export const meetingSchema = z.object({
  title: requiredText(200, '会議名'),
  heldAt: dateTimeField,
  attendees: z.array(z.string().max(100)).max(50).default([]),
  agenda: optionalText(4000),
  minutes: optionalText(20000),
  visibility: VISIBILITY.default('ALL'),
})

export type MeetingInput = z.infer<typeof meetingSchema>

export async function listMeetings(companyId: string, role: CoRole) {
  return prisma.coMeeting.findMany({
    where: { companyId, ...visibilityFilter(role) },
    include: { _count: { select: { tasks: true, issues: true, decisions: true, questions: true } } },
    orderBy: { heldAt: 'desc' },
  })
}

export async function getMeeting(companyId: string, role: CoRole, id: string) {
  return prisma.coMeeting.findFirst({
    where: { id, companyId, ...visibilityFilter(role) },
    include: {
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      issues: { orderBy: { createdAt: 'asc' } },
      decisions: { orderBy: { createdAt: 'asc' } },
      questions: { orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function createMeeting(companyId: string, input: MeetingInput) {
  return prisma.coMeeting.create({
    data: { companyId, ...input, attendees: input.attendees as unknown as Prisma.InputJsonValue },
  })
}

export async function updateMeeting(companyId: string, id: string, input: Partial<MeetingInput>) {
  const found = await prisma.coMeeting.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!found) return null
  const data: Prisma.CoMeetingUpdateInput = { ...(input as Prisma.CoMeetingUpdateInput) }
  if (input.attendees) data.attendees = input.attendees as unknown as Prisma.InputJsonValue
  return prisma.coMeeting.update({ where: { id }, data })
}

export async function deleteMeeting(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coMeeting.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

// ---------------------------------------------------------------------------
// 経営目標 / KPI
// ---------------------------------------------------------------------------

export const objectiveSchema = z.object({
  title: requiredText(200, '目標名'),
  description: optionalText(2000),
  isKpi: z.boolean().default(false),
  targetValue: z.coerce.number().nullish(),
  currentValue: z.coerce.number().nullish(),
  unit: optionalText(20),
  status: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED', 'DROPPED']).default('ON_TRACK'),
  area: AREA.default('MANAGEMENT'),
  periodLabel: optionalText(40),
  dueOn: dateField,
  ownerId: idRef,
})

export type ObjectiveInput = z.infer<typeof objectiveSchema>

export async function listObjectives(companyId: string, filters: { isKpi?: boolean } = {}) {
  const where: Prisma.CoObjectiveWhereInput = { companyId }
  if (filters.isKpi !== undefined) where.isKpi = filters.isKpi
  return prisma.coObjective.findMany({
    where,
    include: { owner: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createObjective(companyId: string, input: ObjectiveInput) {
  const max = await prisma.coObjective.aggregate({ where: { companyId }, _max: { sortOrder: true } })
  return prisma.coObjective.create({
    data: { companyId, ...input, sortOrder: (max._max.sortOrder ?? 0) + 10 },
  })
}

export async function updateObjective(companyId: string, id: string, input: Partial<ObjectiveInput>) {
  const found = await prisma.coObjective.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!found) return null
  return prisma.coObjective.update({ where: { id }, data: input })
}

export async function deleteObjective(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coObjective.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

/** 達成率（%）。目標値が無い定性目標は null */
export function achievementRate(target: number | null, current: number | null): number | null {
  if (target === null || target === undefined || target === 0) return null
  const value = current ?? 0
  return Math.max(0, Math.round((value / target) * 100))
}
