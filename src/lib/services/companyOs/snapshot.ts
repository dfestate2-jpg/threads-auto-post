/**
 * AIアシスタントに渡すスナップショットを作る。
 *
 * 「会社のいまを一つの形にまとめる」ことが目的。
 * Phase3 で言語モデルに渡すのもこの形なので、ここに集めておけば
 * AI に見せる範囲＝権限の範囲をここ1か所で制御できる。
 */
import type { CoRole } from '@prisma/client'

import type { CompanySnapshot } from '@/lib/company-os/advisor'
import { prisma } from '@/lib/prisma'
import { loadDashboard } from './dashboard'

export async function buildSnapshot(
  company: { id: string; name: string; stage: CompanySnapshot['stage'] },
  role: CoRole,
  now: Date,
  timezone?: string,
): Promise<CompanySnapshot> {
  const [dashboard, issues, questions, decisionAgg, lastDecision, lastMeeting] = await Promise.all([
    loadDashboard(company.id, role, now, timezone),
    prisma.coIssue.findMany({
      where: { companyId: company.id, status: { notIn: ['RESOLVED'] } },
      select: { id: true, title: true, severity: true, status: true, ownerId: true, countermeasure: true, dueOn: true },
    }),
    prisma.coQuestion.findMany({
      where: { companyId: company.id, status: { notIn: ['DECIDED'] } },
      select: { id: true, title: true, status: true, dueOn: true, severity: true },
    }),
    prisma.coDecision.count({ where: { companyId: company.id } }),
    prisma.coDecision.findFirst({
      where: { companyId: company.id },
      orderBy: { decidedOn: 'desc' },
      select: { decidedOn: true },
    }),
    prisma.coMeeting.findFirst({
      where: { companyId: company.id },
      orderBy: { heldAt: 'desc' },
      select: { heldAt: true },
    }),
  ])

  const openTasks = [...dashboard.overdue, ...dashboard.today, ...dashboard.week]
  // 期限の無いタスクも判断材料になるので、重複を除いて全件を渡す
  const allOpen = dashboard.top.concat(openTasks)
  const seen = new Set<string>()
  const tasks = allOpen
    .concat(dashboard.top)
    .filter((r) => {
      if (seen.has(r.task.id)) return false
      seen.add(r.task.id)
      return true
    })
    .map((r) => ({
      id: r.task.id,
      title: r.task.title,
      status: r.task.status,
      dueOn: r.task.dueOn,
      assigneeName: r.task.source.assignee?.name ?? null,
      assigned: r.task.source.assigneeId !== null,
      overdueDays: r.scored.overdueDays,
      score: r.scored.score,
      blocked: r.scored.blocked,
      area: r.task.source.area,
      reasons: r.scored.reasons,
    }))

  return {
    now,
    timezone,
    companyName: company.name,
    stage: company.stage,
    tasks,
    projects: dashboard.projects.map((p) => ({
      id: p.project.id,
      name: p.project.name,
      health: p.health,
      percent: p.progress.percent,
      daysLeft: p.daysLeft,
      openTaskCount: p.openTaskCount,
      overdueTaskCount: p.overdueTaskCount,
    })),
    issues: issues.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      hasOwner: i.ownerId !== null,
      hasCountermeasure: (i.countermeasure ?? '').trim().length > 0,
      dueOn: i.dueOn,
    })),
    questions,
    decisionCount: decisionAgg,
    lastDecisionAt: lastDecision?.decidedOn ?? null,
    lastMeetingAt: lastMeeting?.heldAt ?? null,
    meetingCount: dashboard.meetingCount,
    expiringDocuments: dashboard.expiringDocuments,
    metrics: dashboard.metrics,
    foundingPercent: dashboard.founding.percent,
  }
}
