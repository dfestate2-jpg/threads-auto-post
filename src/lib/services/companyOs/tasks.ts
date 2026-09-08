/**
 * タスク。会社運営の中心データ。
 *
 * 一覧の並びは必ず優先順位エンジン（lib/company-os/priority.ts）を通す。
 * 依存関係の件数はここで数えて渡す — 画面側で数えると、画面ごとに
 * 「止めている件数」の定義がずれるため。
 */
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { CLOSED_TASK_STATUSES } from '@/lib/company-os/labels'
import { rankTasks, type RankedTask, type TaskSignals } from '@/lib/company-os/priority'
import { prisma } from '@/lib/prisma'
import { dateField, idRef, impactField, optionalText, requiredText } from './input'

export const taskInclude = {
  assignee: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, status: true, dueOn: true, priority: true, color: true } },
  issue: { select: { id: true, title: true } },
  meeting: { select: { id: true, title: true } },
  checklist: { orderBy: { sortOrder: 'asc' } },
  _count: { select: { comments: true, checklist: true } },
} satisfies Prisma.CoTaskInclude

export type TaskWithRelations = Prisma.CoTaskGetPayload<{ include: typeof taskInclude }>

export const taskSchema = z.object({
  title: requiredText(200, 'タスク名'),
  description: optionalText(4000),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'ON_HOLD', 'CANCELED']).default('TODO'),
  priority: z.enum(['TOP', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  area: z
    .enum(['COMPANY', 'LEGAL', 'MANAGEMENT', 'BUSINESS', 'SALES', 'CUSTOMER', 'DEVELOPMENT', 'SUBSIDY', 'MA', 'FINANCE', 'HR', 'OTHER'])
    .default('OTHER'),
  projectId: idRef,
  assigneeId: idRef,
  issueId: idRef,
  meetingId: idRef,
  startOn: dateField,
  dueOn: dateField,
  relatedCustomer: optionalText(200),
  relatedParty: optionalText(200),
  revenueImpact: impactField,
  riskImpact: impactField,
})

export type TaskInput = z.infer<typeof taskSchema>

export interface TaskFilters {
  status?: string[]
  area?: string
  projectId?: string
  assigneeId?: string
  issueId?: string
  meetingId?: string
  /** 完了・中止も含めるか */
  includeClosed?: boolean
  q?: string
}

function whereOf(companyId: string, filters: TaskFilters): Prisma.CoTaskWhereInput {
  const where: Prisma.CoTaskWhereInput = { companyId }
  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status as Prisma.EnumCoTaskStatusFilter['in'] }
  } else if (!filters.includeClosed) {
    where.status = { notIn: CLOSED_TASK_STATUSES }
  }
  if (filters.area) where.area = filters.area as Prisma.CoTaskWhereInput['area']
  if (filters.projectId) where.projectId = filters.projectId
  if (filters.assigneeId) where.assigneeId = filters.assigneeId === 'none' ? null : filters.assigneeId
  if (filters.issueId) where.issueId = filters.issueId
  if (filters.meetingId) where.meetingId = filters.meetingId
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  return where
}

export async function listTasks(companyId: string, filters: TaskFilters = {}): Promise<TaskWithRelations[]> {
  return prisma.coTask.findMany({
    where: whereOf(companyId, filters),
    include: taskInclude,
    orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

/** 依存関係の件数。会社全体で1回だけ引いて、必要なタスクに配る */
export interface DependencyCounts {
  /** taskId → まだ終わっていない先行タスクの数 */
  blockedBy: Map<string, number>
  /** taskId → このタスクを待っている未完了タスクの数 */
  blocking: Map<string, number>
}

export async function loadDependencyCounts(companyId: string): Promise<DependencyCounts> {
  const links = await prisma.coTaskDependency.findMany({
    where: { task: { companyId } },
    select: {
      taskId: true,
      dependsOnId: true,
      task: { select: { status: true } },
      dependsOn: { select: { status: true } },
    },
  })

  const blockedBy = new Map<string, number>()
  const blocking = new Map<string, number>()
  for (const link of links) {
    const blockerDone = CLOSED_TASK_STATUSES.includes(link.dependsOn.status)
    const dependentDone = CLOSED_TASK_STATUSES.includes(link.task.status)
    if (!blockerDone) blockedBy.set(link.taskId, (blockedBy.get(link.taskId) ?? 0) + 1)
    if (!dependentDone) blocking.set(link.dependsOnId, (blocking.get(link.dependsOnId) ?? 0) + 1)
  }
  return { blockedBy, blocking }
}

export function toSignals(task: TaskWithRelations, counts: DependencyCounts): TaskSignals & { source: TaskWithRelations } {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueOn: task.dueOn,
    revenueImpact: task.revenueImpact,
    riskImpact: task.riskImpact,
    blockingCount: counts.blocking.get(task.id) ?? 0,
    blockedByCount: counts.blockedBy.get(task.id) ?? 0,
    project: task.project
      ? { status: task.project.status, dueOn: task.project.dueOn, priority: task.project.priority }
      : null,
    source: task,
  }
}

export type RankedTaskRow = RankedTask<TaskSignals & { source: TaskWithRelations }>

/** 一覧＋採点。画面はこれを受け取るだけでよい */
export async function listRankedTasks(
  companyId: string,
  filters: TaskFilters,
  now: Date,
  timezone?: string,
): Promise<RankedTaskRow[]> {
  const [tasks, counts] = await Promise.all([listTasks(companyId, filters), loadDependencyCounts(companyId)])
  return rankTasks(
    tasks.map((t) => toSignals(t, counts)),
    now,
    timezone,
  )
}

export async function getTask(companyId: string, id: string) {
  return prisma.coTask.findFirst({
    where: { id, companyId },
    include: {
      ...taskInclude,
      comments: { orderBy: { createdAt: 'asc' } },
      documents: true,
      dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true, dueOn: true } } } },
      dependents: { include: { task: { select: { id: true, title: true, status: true, dueOn: true } } } },
    },
  })
}

function nextSortOrder(max: number | null): number {
  return (max ?? 0) + 10
}

export async function createTask(companyId: string, input: TaskInput) {
  const max = await prisma.coTask.aggregate({ where: { companyId }, _max: { sortOrder: true } })
  return prisma.coTask.create({
    data: {
      companyId,
      ...input,
      sortOrder: nextSortOrder(max._max.sortOrder),
      completedAt: input.status === 'DONE' ? new Date() : null,
    },
    include: taskInclude,
  })
}

export async function updateTask(companyId: string, id: string, input: Partial<TaskInput>) {
  const current = await prisma.coTask.findFirst({ where: { id, companyId }, select: { status: true } })
  if (!current) return null

  const data: Prisma.CoTaskUpdateInput = { ...(input as Prisma.CoTaskUpdateInput) }
  // 完了時刻は状態が変わった瞬間だけ動かす。編集のたびに書き換えると履歴として使えない
  if (input.status && input.status !== current.status) {
    data.completedAt = input.status === 'DONE' ? new Date() : null
  }
  return prisma.coTask.update({ where: { id }, data, include: taskInclude })
}

export async function deleteTask(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coTask.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

// --- チェックリスト ---------------------------------------------------------

export async function addChecklistItem(companyId: string, taskId: string, label: string) {
  const task = await prisma.coTask.findFirst({ where: { id: taskId, companyId }, select: { id: true } })
  if (!task) return null
  const max = await prisma.coChecklistItem.aggregate({ where: { taskId }, _max: { sortOrder: true } })
  return prisma.coChecklistItem.create({
    data: { taskId, label: label.trim().slice(0, 200), sortOrder: nextSortOrder(max._max.sortOrder) },
  })
}

export async function setChecklistDone(companyId: string, itemId: string, done: boolean) {
  const item = await prisma.coChecklistItem.findFirst({
    where: { id: itemId, task: { companyId } },
    select: { id: true },
  })
  if (!item) return null
  return prisma.coChecklistItem.update({ where: { id: itemId }, data: { done } })
}

export async function deleteChecklistItem(companyId: string, itemId: string): Promise<boolean> {
  const result = await prisma.coChecklistItem.deleteMany({ where: { id: itemId, task: { companyId } } })
  return result.count > 0
}

// --- コメント ---------------------------------------------------------------

export async function addComment(
  companyId: string,
  target: { taskId?: string; issueId?: string },
  author: { id: string | null; name: string },
  body: string,
) {
  const text = body.trim()
  if (!text) return null

  if (target.taskId) {
    const task = await prisma.coTask.findFirst({ where: { id: target.taskId, companyId }, select: { id: true } })
    if (!task) return null
  } else if (target.issueId) {
    const issue = await prisma.coIssue.findFirst({ where: { id: target.issueId, companyId }, select: { id: true } })
    if (!issue) return null
  } else {
    return null
  }

  return prisma.coComment.create({
    data: {
      taskId: target.taskId ?? null,
      issueId: target.issueId ?? null,
      authorId: author.id,
      authorName: author.name,
      body: text.slice(0, 4000),
    },
  })
}

// --- 依存関係 ---------------------------------------------------------------

/**
 * 依存を1本張る。
 * 循環すると「永久に着手できないタスク」ができるため、追加前に必ず検査する。
 */
export async function addDependency(companyId: string, taskId: string, dependsOnId: string): Promise<string | null> {
  if (taskId === dependsOnId) return '自分自身を先行タスクにはできません'

  const tasks = await prisma.coTask.findMany({
    where: { companyId, id: { in: [taskId, dependsOnId] } },
    select: { id: true },
  })
  if (tasks.length !== 2) return '対象のタスクが見つかりません'

  const links = await prisma.coTaskDependency.findMany({
    where: { task: { companyId } },
    select: { taskId: true, dependsOnId: true },
  })
  if (wouldCycle(links, taskId, dependsOnId)) return '依存関係が循環するため設定できません'

  await prisma.coTaskDependency.upsert({
    where: { taskId_dependsOnId: { taskId, dependsOnId } },
    create: { taskId, dependsOnId },
    update: {},
  })
  return null
}

/** 追加すると循環するか。taskId から dependsOnId へ辿り着けるなら循環する */
export function wouldCycle(
  links: { taskId: string; dependsOnId: string }[],
  taskId: string,
  dependsOnId: string,
): boolean {
  const edges = new Map<string, string[]>()
  for (const link of links) {
    const list = edges.get(link.taskId) ?? []
    list.push(link.dependsOnId)
    edges.set(link.taskId, list)
  }
  const seen = new Set<string>()
  const stack = [dependsOnId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (current === taskId) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(edges.get(current) ?? []))
  }
  return false
}

export async function removeDependency(companyId: string, taskId: string, dependsOnId: string): Promise<boolean> {
  const result = await prisma.coTaskDependency.deleteMany({
    where: { taskId, dependsOnId, task: { companyId } },
  })
  return result.count > 0
}
