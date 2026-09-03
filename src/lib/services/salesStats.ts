/**
 * 管理者向けの集計。【指示書 14】
 *
 * 「誰が・どれだけ追客していて・どれだけ決めているか」を担当者ごとに出す。
 * 集計は追客履歴（follow_up_logs）から作るため、営業マンの自己申告に依存しない。
 */
import { CustomerStatus, FollowUpSource } from '@prisma/client'

import { TERMINAL_STATUSES } from '@/lib/domain/followUp'
import { startOfDayIn } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'

export interface StaffPerformance {
  staffId: string | null
  staffName: string
  /** 担当している反響数（期間内に問い合わせがあった顧客） */
  inquiries: number
  /** 追客した回数（履歴の件数） */
  followUps: number
  /** 追客した顧客数 */
  contactedCustomers: number
  viewings: number
  applications: number
  contracts: number
  lost: number
  /** 成約率＝成約数 ÷ 反響数 */
  contractRate: number
  /** 現在抱えている追客中の顧客数 */
  activeCustomers: number
  /** 現在の期限超過件数 */
  overdue: number
}

export interface AdminOverview {
  totalCustomers: number
  activeCustomers: number
  byStatus: { status: CustomerStatus; count: number }[]
  overdue: number
  todayDue: number
  todayFollowUps: number
  unassigned: number
  noReply: number
  dormant: number
  contracted: number
  lost: number
  autoFollowing: number
  staff: StaffPerformance[]
  /** 集計期間の開始。null は全期間 */
  since: Date | null
}

export interface AdminOverviewOptions {
  timezone: string
  now?: Date
  /** 集計期間の開始。null なら全期間 */
  since?: Date | null
}

export async function getAdminOverview(options: AdminOverviewOptions): Promise<AdminOverview> {
  const now = options.now ?? new Date()
  const since = options.since ?? null
  const startOfToday = startOfDayIn(options.timezone, now)
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000)
  const activeWhere = { status: { notIn: TERMINAL_STATUSES } }
  const periodWhere = since ? { occurredAt: { gte: since } } : {}

  const [
    totalCustomers,
    activeCustomers,
    statusGroups,
    overdue,
    todayDue,
    todayFollowUps,
    unassigned,
    autoFollowing,
    staffRows,
    logGroups,
    contactedGroups,
    milestoneGroups,
    inquiryGroups,
    activeGroups,
    overdueGroups,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: activeWhere }),
    prisma.customer.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.customer.count({ where: { ...activeWhere, nextActionAt: { lt: startOfToday } } }),
    prisma.customer.count({
      where: { ...activeWhere, nextActionAt: { gte: startOfToday, lt: endOfToday } },
    }),
    prisma.followUpLog.count({
      where: {
        occurredAt: { gte: startOfToday },
        source: { in: [FollowUpSource.MANUAL, FollowUpSource.ADMIN_REPLY, FollowUpSource.LINE_OUTBOUND] },
      },
    }),
    prisma.customer.count({ where: { ...activeWhere, assigneeId: null } }),
    prisma.customer.count({ where: { ...activeWhere, nextActionAt: { gte: endOfToday } } }),
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    // 追客回数（システム処理を除く）
    prisma.followUpLog.groupBy({
      by: ['staffId'],
      where: { ...periodWhere, source: { not: FollowUpSource.AUTO } },
      _count: { _all: true },
    }),
    prisma.followUpLog.findMany({
      where: { ...periodWhere, source: { not: FollowUpSource.AUTO } },
      select: { staffId: true, customerId: true },
      distinct: ['staffId', 'customerId'],
    }),
    // 内見・申込・成約・失注は「そのステータスへ遷移した履歴」で数える
    prisma.followUpLog.findMany({
      where: {
        ...periodWhere,
        statusAfter: {
          in: [
            CustomerStatus.VIEWED,
            CustomerStatus.APPLIED,
            CustomerStatus.CONTRACTED,
            CustomerStatus.LOST,
          ],
        },
      },
      select: { customerId: true, statusAfter: true, customer: { select: { assigneeId: true } } },
    }),
    prisma.customer.groupBy({
      by: ['assigneeId'],
      where: since ? { createdAt: { gte: since } } : {},
      _count: { _all: true },
    }),
    prisma.customer.groupBy({ by: ['assigneeId'], where: activeWhere, _count: { _all: true } }),
    prisma.customer.groupBy({
      by: ['assigneeId'],
      where: { ...activeWhere, nextActionAt: { lt: startOfToday } },
      _count: { _all: true },
    }),
  ])

  const statusCount = (status: CustomerStatus) =>
    statusGroups.find((g) => g.status === status)?._count._all ?? 0

  const key = (id: string | null) => id ?? '__unassigned__'
  const perf = new Map<string, StaffPerformance>()
  const ensure = (id: string | null, name: string): StaffPerformance => {
    const k = key(id)
    const found = perf.get(k)
    if (found) return found
    const created: StaffPerformance = {
      staffId: id,
      staffName: name,
      inquiries: 0,
      followUps: 0,
      contactedCustomers: 0,
      viewings: 0,
      applications: 0,
      contracts: 0,
      lost: 0,
      contractRate: 0,
      activeCustomers: 0,
      overdue: 0,
    }
    perf.set(k, created)
    return created
  }

  for (const s of staffRows) ensure(s.id, s.name)
  ensure(null, '担当者未設定')

  const nameOf = (id: string | null) =>
    id === null ? '担当者未設定' : (staffRows.find((s) => s.id === id)?.name ?? '（削除済み担当者）')

  for (const g of logGroups) ensure(g.staffId, nameOf(g.staffId)).followUps += g._count._all
  for (const g of contactedGroups) ensure(g.staffId, nameOf(g.staffId)).contactedCustomers += 1
  for (const g of inquiryGroups) ensure(g.assigneeId, nameOf(g.assigneeId)).inquiries += g._count._all
  for (const g of activeGroups) ensure(g.assigneeId, nameOf(g.assigneeId)).activeCustomers += g._count._all
  for (const g of overdueGroups) ensure(g.assigneeId, nameOf(g.assigneeId)).overdue += g._count._all

  // 同じ顧客が同じ段階を何度も通ることがあるため、顧客×段階で1回に丸める
  const seen = new Set<string>()
  for (const m of milestoneGroups) {
    if (!m.statusAfter) continue
    const dedupe = `${m.customerId}:${m.statusAfter}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    const entry = ensure(m.customer.assigneeId, nameOf(m.customer.assigneeId))
    if (m.statusAfter === CustomerStatus.VIEWED) entry.viewings += 1
    if (m.statusAfter === CustomerStatus.APPLIED) entry.applications += 1
    if (m.statusAfter === CustomerStatus.CONTRACTED) entry.contracts += 1
    if (m.statusAfter === CustomerStatus.LOST) entry.lost += 1
  }

  const staff = [...perf.values()]
    .map((s) => ({ ...s, contractRate: s.inquiries > 0 ? s.contracts / s.inquiries : 0 }))
    .filter((s) => s.staffId !== null || s.inquiries > 0 || s.activeCustomers > 0 || s.followUps > 0)
    .sort((a, b) => b.contracts - a.contracts || b.activeCustomers - a.activeCustomers)

  return {
    totalCustomers,
    activeCustomers,
    byStatus: statusGroups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    overdue,
    todayDue,
    todayFollowUps,
    unassigned,
    noReply: statusCount(CustomerStatus.NO_REPLY),
    dormant: statusCount(CustomerStatus.DORMANT),
    contracted: statusCount(CustomerStatus.CONTRACTED),
    lost: statusCount(CustomerStatus.LOST),
    autoFollowing,
    staff,
    since,
  }
}
