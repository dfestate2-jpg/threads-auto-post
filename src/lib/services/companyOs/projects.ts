/**
 * プロジェクト。会社の大きな仕事の単位。
 *
 * 進捗率はタスクの完了率から自動で出す（手入力で上書きもできる）。
 * 「進行中」と自己申告するだけでは遅れが見えないため。
 */
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { daysUntilDue } from '@/lib/company-os/date'
import { projectHealth, taskProgress, type Progress, type ProjectHealth } from '@/lib/company-os/progress'
import { prisma } from '@/lib/prisma'
import { dateField, idRef, optionalText, requiredText } from './input'

export const projectSchema = z.object({
  name: requiredText(120, 'プロジェクト名'),
  description: optionalText(4000),
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'DONE', 'CANCELED']).default('PLANNING'),
  area: z
    .enum(['COMPANY', 'LEGAL', 'MANAGEMENT', 'BUSINESS', 'SALES', 'CUSTOMER', 'DEVELOPMENT', 'SUBSIDY', 'MA', 'FINANCE', 'HR', 'OTHER'])
    .default('OTHER'),
  priority: z.enum(['TOP', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  ownerId: idRef,
  startOn: dateField,
  dueOn: dateField,
  progressOverride: z.coerce.number().int().min(0).max(100).nullish(),
  color: z.string().max(20).default('slate'),
})

export type ProjectInput = z.infer<typeof projectSchema>

export interface ProjectSummary {
  project: Prisma.CoProjectGetPayload<{
    include: {
      owner: { select: { id: true; name: true } }
      milestones: true
    }
  }>
  progress: Progress
  health: ProjectHealth
  overdueTaskCount: number
  openTaskCount: number
  openIssueCount: number
  daysLeft: number | null
}

const projectInclude = {
  owner: { select: { id: true, name: true } },
  milestones: { orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] },
} satisfies Prisma.CoProjectInclude

/**
 * 一覧＋集計。タスクを1回だけ引いて各プロジェクトに配る。
 * プロジェクトごとに数え直すと、件数が増えるほど画面が遅くなる。
 */
export async function listProjectSummaries(
  companyId: string,
  now: Date,
  timezone?: string,
  options: { includeClosed?: boolean } = {},
): Promise<ProjectSummary[]> {
  const where: Prisma.CoProjectWhereInput = { companyId }
  if (!options.includeClosed) where.status = { notIn: ['DONE', 'CANCELED'] }

  const [projects, tasks, issues] = await Promise.all([
    prisma.coProject.findMany({
      where,
      include: projectInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.coTask.findMany({
      where: { companyId, projectId: { not: null } },
      select: { projectId: true, status: true, dueOn: true },
    }),
    prisma.coIssue.groupBy({
      by: ['projectId'],
      where: { companyId, status: { in: ['OPEN', 'INVESTIGATING', 'ACTING'] }, projectId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const issueCount = new Map(issues.map((i) => [i.projectId, i._count._all]))

  return projects.map((project) => {
    const own = tasks.filter((t) => t.projectId === project.id)
    const progress = taskProgress(
      own.map((t) => t.status),
      project.progressOverride,
    )
    const overdueTaskCount = own.filter((t) => {
      if (t.status === 'DONE' || t.status === 'CANCELED') return false
      const days = daysUntilDue(t.dueOn, now, timezone)
      return days !== null && days < 0
    }).length

    return {
      project,
      progress,
      overdueTaskCount,
      openTaskCount: own.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELED').length,
      openIssueCount: issueCount.get(project.id) ?? 0,
      daysLeft: daysUntilDue(project.dueOn, now, timezone),
      health: projectHealth({
        status: project.status,
        startOn: project.startOn,
        dueOn: project.dueOn,
        progress,
        overdueTaskCount,
        now,
        timezone,
      }),
    }
  })
}

export async function getProject(companyId: string, id: string) {
  return prisma.coProject.findFirst({ where: { id, companyId }, include: projectInclude })
}

export async function listProjectOptions(companyId: string) {
  return prisma.coProject.findMany({
    where: { companyId, status: { notIn: ['CANCELED'] } },
    select: { id: true, name: true, status: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createProject(companyId: string, input: ProjectInput) {
  const max = await prisma.coProject.aggregate({ where: { companyId }, _max: { sortOrder: true } })
  return prisma.coProject.create({
    data: { companyId, ...input, sortOrder: (max._max.sortOrder ?? 0) + 10 },
    include: projectInclude,
  })
}

export async function updateProject(companyId: string, id: string, input: Partial<ProjectInput>) {
  const found = await prisma.coProject.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!found) return null
  return prisma.coProject.update({ where: { id }, data: input, include: projectInclude })
}

export async function deleteProject(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coProject.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

// --- マイルストーン ---------------------------------------------------------

export const milestoneSchema = z.object({
  projectId: z.string().min(1),
  name: requiredText(120, 'マイルストーン名'),
  dueOn: dateField,
  done: z.boolean().default(false),
})

export async function createMilestone(companyId: string, input: z.infer<typeof milestoneSchema>) {
  const project = await prisma.coProject.findFirst({
    where: { id: input.projectId, companyId },
    select: { id: true },
  })
  if (!project) return null
  const max = await prisma.coMilestone.aggregate({ where: { projectId: input.projectId }, _max: { sortOrder: true } })
  return prisma.coMilestone.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      dueOn: input.dueOn,
      done: input.done,
      doneAt: input.done ? new Date() : null,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
    },
  })
}

export async function setMilestoneDone(companyId: string, id: string, done: boolean) {
  const found = await prisma.coMilestone.findFirst({
    where: { id, project: { companyId } },
    select: { id: true },
  })
  if (!found) return null
  return prisma.coMilestone.update({ where: { id }, data: { done, doneAt: done ? new Date() : null } })
}

export async function deleteMilestone(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coMilestone.deleteMany({ where: { id, project: { companyId } } })
  return result.count > 0
}

/** すべてのマイルストーンを期限順に。タイムライン表示で使う */
export async function listMilestones(companyId: string) {
  return prisma.coMilestone.findMany({
    where: { project: { companyId } },
    include: { project: { select: { id: true, name: true, color: true, status: true } } },
    orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
  })
}
