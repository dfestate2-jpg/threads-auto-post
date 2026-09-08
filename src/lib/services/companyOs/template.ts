/**
 * テンプレートからプロジェクトとタスクを作る。
 *
 * ボタン1つで数十件のタスクが増えるため、二重生成は致命的。
 * タスクには templateKey（会社ごとに一意）を持たせ、既にあるものは飛ばす。
 * 押し直しても増えないので、途中で失敗しても安心して再実行できる。
 */
import { Prisma } from '@prisma/client'

import { addDaysToKey, fromDateKey, toDateKey } from '@/lib/company-os/date'
import { findTemplate, validateTemplate, type ProjectTemplate } from '@/lib/company-os/templates'
import { prisma } from '@/lib/prisma'

export interface ApplyResult {
  projectId: string
  projectName: string
  createdTasks: number
  skippedTasks: number
  createdMilestones: number
}

export class TemplateError extends Error {}

export async function applyTemplate(
  companyId: string,
  templateKey: string,
  options: { startOn?: Date | null; ownerId?: string | null } = {},
): Promise<ApplyResult> {
  const template = findTemplate(templateKey)
  if (!template) throw new TemplateError('テンプレートが見つかりません')

  const problems = validateTemplate(template)
  if (problems.length > 0) throw new TemplateError(`テンプレートの定義に問題があります: ${problems.join(' / ')}`)

  const startKey = toDateKey(options.startOn ?? new Date(), 'UTC')
  const dueOf = (offsetDays: number) => fromDateKey(addDaysToKey(startKey, offsetDays))

  // 既にこのテンプレートから作ったタスクがあれば飛ばす
  const existing = await prisma.coTask.findMany({
    where: { companyId, templateKey: { startsWith: `${template.key}:` } },
    select: { id: true, templateKey: true, projectId: true },
  })
  const existingByKey = new Map(existing.map((t) => [t.templateKey as string, t]))

  return prisma.$transaction(
    async (tx) => {
      const project = await resolveProject(tx, companyId, template, {
        startOn: fromDateKey(startKey),
        ownerId: options.ownerId ?? null,
        existingProjectId: existing.find((t) => t.projectId)?.projectId ?? null,
      })

      const idByKey = new Map<string, string>()
      let created = 0
      for (const task of template.tasks) {
        const key = `${template.key}:${task.key}`
        const found = existingByKey.get(key)
        if (found) {
          idByKey.set(task.key, found.id)
          continue
        }
        const row = await tx.coTask.create({
          data: {
            companyId,
            projectId: project.id,
            title: task.title,
            description: task.description ?? null,
            area: task.area,
            priority: task.priority,
            startOn: fromDateKey(startKey),
            dueOn: dueOf(task.offsetDays),
            revenueImpact: task.revenueImpact ?? 0,
            riskImpact: task.riskImpact ?? 0,
            templateKey: key,
            sortOrder: created * 10,
            assigneeId: options.ownerId ?? null,
            checklist: task.checklist
              ? { create: task.checklist.map((label, i) => ({ label, sortOrder: i * 10 })) }
              : undefined,
          },
          select: { id: true },
        })
        idByKey.set(task.key, row.id)
        created += 1
      }

      // 依存関係は全タスクを作り終えてから張る（先行タスクのIDが必要なため）
      for (const task of template.tasks) {
        const taskId = idByKey.get(task.key)
        if (!taskId) continue
        for (const dep of task.dependsOn ?? []) {
          const dependsOnId = idByKey.get(dep)
          if (!dependsOnId || dependsOnId === taskId) continue
          await tx.coTaskDependency.upsert({
            where: { taskId_dependsOnId: { taskId, dependsOnId } },
            create: { taskId, dependsOnId },
            update: {},
          })
        }
      }

      const existingMilestones = await tx.coMilestone.findMany({
        where: { projectId: project.id },
        select: { name: true },
      })
      const milestoneNames = new Set(existingMilestones.map((m) => m.name))
      let createdMilestones = 0
      for (const [i, milestone] of template.milestones.entries()) {
        if (milestoneNames.has(milestone.name)) continue
        await tx.coMilestone.create({
          data: {
            projectId: project.id,
            name: milestone.name,
            dueOn: dueOf(milestone.offsetDays),
            sortOrder: i * 10,
          },
        })
        createdMilestones += 1
      }

      return {
        projectId: project.id,
        projectName: project.name,
        createdTasks: created,
        skippedTasks: template.tasks.length - created,
        createdMilestones,
      }
    },
    { timeout: 30_000 },
  )
}

/** 同じテンプレートを再実行したときは、前回のプロジェクトを使い回す */
async function resolveProject(
  tx: Prisma.TransactionClient,
  companyId: string,
  template: ProjectTemplate,
  options: { startOn: Date | null; ownerId: string | null; existingProjectId: string | null },
) {
  if (options.existingProjectId) {
    const found = await tx.coProject.findFirst({
      where: { id: options.existingProjectId, companyId },
      select: { id: true, name: true },
    })
    if (found) return found
  }
  const max = await tx.coProject.aggregate({ where: { companyId }, _max: { sortOrder: true } })
  return tx.coProject.create({
    data: {
      companyId,
      name: template.name,
      description: template.description,
      area: template.area,
      status: 'ACTIVE',
      priority: 'HIGH',
      startOn: options.startOn,
      ownerId: options.ownerId,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
    },
    select: { id: true, name: true },
  })
}
