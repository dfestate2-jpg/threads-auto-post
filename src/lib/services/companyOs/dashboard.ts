/**
 * 経営ダッシュボードの集計。
 *
 * 画面が「今の会社の状態」を1回のクエリ束で受け取れるようにする。
 * 画面側で数え直すと、カードの数字と一覧の件数がずれる。
 */
import type { CoRole } from '@prisma/client'

import { dateWindow, fromDateKey } from '@/lib/company-os/date'
import { DASHBOARD_METRICS } from '@/lib/company-os/metrics'
import { pickTopTasks } from '@/lib/company-os/priority'
import { taskProgress } from '@/lib/company-os/progress'
import { prisma } from '@/lib/prisma'
import { listExpiringDocuments } from './company'
import { listProjectSummaries, type ProjectSummary } from './projects'
import { listRankedTasks, type RankedTaskRow } from './tasks'

export interface DashboardData {
  top: RankedTaskRow[]
  overdue: RankedTaskRow[]
  today: RankedTaskRow[]
  week: RankedTaskRow[]
  inProgressCount: number
  openTaskCount: number
  unassignedCount: number
  founding: { done: number; total: number; percent: number }
  projects: ProjectSummary[]
  delayedProjects: ProjectSummary[]
  issues: { total: number; critical: number; rows: { id: string; title: string; severity: string; status: string }[] }
  questions: { total: number; overdue: number; rows: { id: string; title: string; status: string; dueOn: Date | null }[] }
  decisions: { id: string; title: string; decidedOn: Date; deciderName: string | null }[]
  metrics: { key: string; label: string; unit: string; value: number | null; target: number | null }[]
  expiringDocuments: { id: string; name: string; expiresOn: Date | null }[]
  meetingCount: number
}

export async function loadDashboard(
  companyId: string,
  role: CoRole,
  now: Date,
  timezone?: string,
): Promise<DashboardData> {
  const window = dateWindow(now, timezone)
  const todayDate = fromDateKey(window.today) as Date
  const weekEndDate = fromDateKey(window.weekEnd) as Date
  const in30Days = new Date(now.getTime() + 30 * 86_400_000)

  const [ranked, projects, issueRows, questionRows, decisions, objectives, expiring, meetingCount, foundingTasks] =
    await Promise.all([
      listRankedTasks(companyId, {}, now, timezone),
      listProjectSummaries(companyId, now, timezone),
      prisma.coIssue.findMany({
        where: { companyId, status: { in: ['OPEN', 'INVESTIGATING', 'ACTING'] } },
        select: { id: true, title: true, severity: true, status: true },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.coQuestion.findMany({
        where: { companyId, status: { notIn: ['DECIDED'] } },
        select: { id: true, title: true, status: true, dueOn: true },
        orderBy: [{ severity: 'asc' }, { dueOn: { sort: 'asc', nulls: 'last' } }],
      }),
      prisma.coDecision.findMany({
        where: { companyId, important: true },
        select: { id: true, title: true, decidedOn: true, deciderName: true, decider: { select: { name: true } } },
        orderBy: { decidedOn: 'desc' },
        take: 5,
      }),
      prisma.coObjective.findMany({
        where: { companyId, metricKey: { not: null } },
        select: { metricKey: true, currentValue: true, targetValue: true, unit: true },
      }),
      listExpiringDocuments(companyId, role, in30Days),
      prisma.coMeeting.count({ where: { companyId } }),
      // 設立の進捗は「会社設立」「法務」領域のタスクで測る
      prisma.coTask.findMany({
        where: { companyId, area: { in: ['COMPANY', 'LEGAL'] } },
        select: { status: true },
      }),
    ])

  const open = ranked.filter((r) => r.task.status !== 'DONE' && r.task.status !== 'CANCELED')

  const overdue = open.filter((r) => r.scored.overdueDays > 0)
  const today = open.filter((r) => {
    const due = r.task.dueOn
    return due !== null && r.scored.overdueDays === 0 && due.getTime() === todayDate.getTime()
  })
  const week = open.filter((r) => {
    const due = r.task.dueOn
    return (
      due !== null &&
      r.scored.overdueDays === 0 &&
      due.getTime() > todayDate.getTime() &&
      due.getTime() <= weekEndDate.getTime()
    )
  })

  const metricByKey = new Map(objectives.map((o) => [o.metricKey as string, o]))

  return {
    top: pickTopTasks(
      open.map((r) => r.task),
      now,
      5,
      timezone,
    ),
    overdue,
    today,
    week,
    inProgressCount: open.filter((r) => r.task.status === 'IN_PROGRESS').length,
    openTaskCount: open.length,
    unassignedCount: open.filter((r) => r.task.source.assigneeId === null).length,
    founding: taskProgress(foundingTasks.map((t) => t.status)),
    projects,
    delayedProjects: projects.filter((p) => p.health === 'DELAYED' || p.health === 'AT_RISK'),
    issues: {
      total: issueRows.length,
      critical: issueRows.filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH').length,
      rows: issueRows.slice(0, 5),
    },
    questions: {
      total: questionRows.length,
      overdue: questionRows.filter((q) => q.dueOn !== null && q.dueOn.getTime() < todayDate.getTime()).length,
      rows: questionRows.slice(0, 5),
    },
    decisions: decisions.map((d) => ({
      id: d.id,
      title: d.title,
      decidedOn: d.decidedOn,
      deciderName: d.decider?.name ?? d.deciderName,
    })),
    metrics: DASHBOARD_METRICS.map((def) => {
      const row = metricByKey.get(def.key)
      return {
        key: def.key,
        label: def.label,
        unit: row?.unit ?? def.unit,
        value: row?.currentValue ?? null,
        target: row?.targetValue ?? null,
      }
    }),
    expiringDocuments: expiring.slice(0, 5).map((d) => ({ id: d.id, name: d.name, expiresOn: d.expiresOn })),
    meetingCount,
  }
}

/**
 * 経営数値のKPIレコードを用意する。
 * 会社を作った直後から数値を入れられるようにするための下地。既にあれば何もしない。
 */
export async function ensureDashboardMetrics(companyId: string): Promise<number> {
  const existing = await prisma.coObjective.findMany({
    where: { companyId, metricKey: { not: null } },
    select: { metricKey: true },
  })
  const have = new Set(existing.map((o) => o.metricKey))
  const missing = DASHBOARD_METRICS.filter((m) => !have.has(m.key))
  if (missing.length === 0) return 0

  const max = await prisma.coObjective.aggregate({ where: { companyId }, _max: { sortOrder: true } })
  let order = (max._max.sortOrder ?? 0) + 10
  for (const metric of missing) {
    await prisma.coObjective.create({
      data: {
        companyId,
        title: metric.label,
        description: metric.hint,
        isKpi: true,
        unit: metric.unit,
        metricKey: metric.key,
        area: metric.key.startsWith('revenue') || metric.key === 'contracts' ? 'SALES' : 'FINANCE',
        sortOrder: order,
      },
    })
    order += 10
  }
  return missing.length
}
