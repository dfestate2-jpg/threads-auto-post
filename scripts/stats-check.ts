/**
 * ダッシュボード集計の結合確認スクリプト。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/stats-check.ts
 *
 * 集計は「条件付き集計を1回のSQLでまとめる」形に書き換えてある（往復回数を12→3に削減）。
 * 数え方を間違えても画面上は「もっともらしい数字」が出てしまい気づけないため、
 * **条件ごとに個別に数えた結果と突き合わせて**一致を確認する。
 */
import { Direction, HandlingStatus, PrismaClient, ReplyState } from '@prisma/client'

import { getDashboardStats, startOfTodayIn } from '../src/lib/services/stats'

process.env.SESSION_SECRET ??= 'stats-check-secret'

const prisma = new PrismaClient()
const TZ = 'Asia/Tokyo'
const HOUR = 3_600_000

let failures = 0
function eq(label: string, got: unknown, want: unknown): void {
  if (got === want) {
    console.log(`  ✅ ${label}（${String(got)}）`)
  } else {
    failures += 1
    console.log(`  ❌ ${label}: まとめ集計=${String(got)} / 個別集計=${String(want)}`)
  }
}

async function reset(): Promise<void> {
  await prisma.$transaction([
    prisma.followUpLog.deleteMany(),
    prisma.reminder.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.cronRun.deleteMany(),
  ])
}

/** 集計の各条件に必ず値が入るよう、意図的に散らしたデータを作る */
async function seed(now: Date): Promise<void> {
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR)
  const staffA = await prisma.staff.create({ data: { name: '集計担当A' } })
  const staffB = await prisma.staff.create({ data: { name: '集計担当B' } })

  interface Spec {
    key: string
    assigneeId: string | null
    replyState: ReplyState
    handlingStatus: HandlingStatus
    unrepliedHours: number | null
    intervalMinutes: number | null
    inboundToday: boolean
    outboundToday: boolean
  }

  const specs: Spec[] = [
    // 未返信・経過時間を散らす（1時間/3時間/24時間の境界を跨がせる）
    { key: 'a', assigneeId: staffA.id, replyState: ReplyState.AWAITING, handlingStatus: HandlingStatus.UNHANDLED, unrepliedHours: 0.2, intervalMinutes: null, inboundToday: true, outboundToday: false },
    { key: 'b', assigneeId: staffA.id, replyState: ReplyState.AWAITING, handlingStatus: HandlingStatus.UNHANDLED, unrepliedHours: 2, intervalMinutes: null, inboundToday: true, outboundToday: false },
    { key: 'c', assigneeId: staffB.id, replyState: ReplyState.AWAITING, handlingStatus: HandlingStatus.IN_PROGRESS, unrepliedHours: 5, intervalMinutes: null, inboundToday: true, outboundToday: false },
    { key: 'd', assigneeId: null, replyState: ReplyState.AWAITING, handlingStatus: HandlingStatus.NEEDS_CHECK, unrepliedHours: 30, intervalMinutes: null, inboundToday: false, outboundToday: false },
    // 通知OFF（顧客側の設定が 0）
    { key: 'e', assigneeId: staffB.id, replyState: ReplyState.AWAITING, handlingStatus: HandlingStatus.UNHANDLED, unrepliedHours: 8, intervalMinutes: 0, inboundToday: true, outboundToday: false },
    // 返信済み（未返信の数には入らないが、要確認・対応中の数には入る）
    { key: 'f', assigneeId: staffA.id, replyState: ReplyState.REPLIED, handlingStatus: HandlingStatus.DONE, unrepliedHours: null, intervalMinutes: null, inboundToday: true, outboundToday: true },
    { key: 'g', assigneeId: null, replyState: ReplyState.REPLIED, handlingStatus: HandlingStatus.NEEDS_CHECK, unrepliedHours: null, intervalMinutes: 0, inboundToday: false, outboundToday: true },
    { key: 'h', assigneeId: staffB.id, replyState: ReplyState.REPLIED, handlingStatus: HandlingStatus.IN_PROGRESS, unrepliedHours: null, intervalMinutes: null, inboundToday: false, outboundToday: true },
  ]

  for (const spec of specs) {
    const customer = await prisma.customer.create({
      data: {
        name: `集計テスト${spec.key}`,
        lineUserId: `U-stats-${spec.key}-${now.getTime()}`,
        assigneeId: spec.assigneeId,
        reminderIntervalMinutes: spec.intervalMinutes,
      },
    })
    await prisma.conversation.create({
      data: {
        customerId: customer.id,
        replyState: spec.replyState,
        handlingStatus: spec.handlingStatus,
        firstUnrepliedAt: spec.unrepliedHours === null ? null : ago(spec.unrepliedHours),
        awaitingSince: spec.unrepliedHours === null ? null : ago(spec.unrepliedHours),
        lastInboundAt: spec.inboundToday ? ago(0.5) : ago(72),
      },
    })
    if (spec.inboundToday) {
      await prisma.message.create({
        data: { customerId: customer.id, direction: Direction.INBOUND, messageType: 'text', text: '本日の受信', sentAt: ago(0.5), source: 'LINE_WEBHOOK' },
      })
      // 同じ顧客からの2通目。「受信数」は通数、「対応済み数」は人数で数える差を検出する
      await prisma.message.create({
        data: { customerId: customer.id, direction: Direction.INBOUND, messageType: 'text', text: '本日の受信2', sentAt: ago(0.4), source: 'LINE_WEBHOOK' },
      })
    }
    if (spec.outboundToday) {
      await prisma.message.create({
        data: { customerId: customer.id, direction: Direction.OUTBOUND, messageType: 'text', text: '本日の返信', sentAt: ago(0.3), source: 'ADMIN_CONSOLE' },
      })
      await prisma.message.create({
        data: { customerId: customer.id, direction: Direction.OUTBOUND, messageType: 'text', text: '本日の返信2', sentAt: ago(0.2), source: 'ADMIN_CONSOLE' },
      })
    }
  }

  await prisma.cronRun.create({ data: { job: 'reminders', startedAt: ago(0.1), finishedAt: ago(0.05) } })
}

async function main(): Promise<void> {
  console.log('ダッシュボード集計 結合確認\n')
  const now = new Date()
  await reset()
  await seed(now)

  const stats = await getDashboardStats(TZ, now)
  const todayStart = startOfTodayIn(TZ, now)
  const h = (hours: number) => new Date(now.getTime() - hours * HOUR)
  const awaiting = { replyState: ReplyState.AWAITING } as const

  console.log('① 件数が個別集計と一致するか')
  eq('未返信合計', stats.awaitingTotal, await prisma.conversation.count({ where: awaiting }))
  eq('1時間以上未返信', stats.over1h, await prisma.conversation.count({ where: { ...awaiting, firstUnrepliedAt: { lte: h(1) } } }))
  eq('3時間以上未返信', stats.over3h, await prisma.conversation.count({ where: { ...awaiting, firstUnrepliedAt: { lte: h(3) } } }))
  eq('24時間以上未返信', stats.over24h, await prisma.conversation.count({ where: { ...awaiting, firstUnrepliedAt: { lte: h(24) } } }))
  eq('要確認', stats.needsCheck, await prisma.conversation.count({ where: { handlingStatus: HandlingStatus.NEEDS_CHECK } }))
  eq('対応中', stats.inProgress, await prisma.conversation.count({ where: { handlingStatus: HandlingStatus.IN_PROGRESS } }))
  eq('通知OFF設定中', stats.notificationDisabled, await prisma.conversation.count({ where: { ...awaiting, customer: { reminderIntervalMinutes: 0 } } }))
  eq('本日のLINE受信数（通数）', stats.todayInbound, await prisma.message.count({ where: { direction: Direction.INBOUND, sentAt: { gte: todayStart } } }))
  const resolved = await prisma.message.findMany({
    where: { direction: Direction.OUTBOUND, sentAt: { gte: todayStart } },
    select: { customerId: true },
    distinct: ['customerId'],
  })
  eq('本日の対応済み数（人数）', stats.todayResolved, resolved.length)

  console.log('\n② 境界と数え方が正しいか')
  check('経過時間の絞り込みが段階的に減る', stats.awaitingTotal >= stats.over1h && stats.over1h >= stats.over3h && stats.over3h >= stats.over24h,
    [stats.awaitingTotal, stats.over1h, stats.over3h, stats.over24h])
  check('受信は通数・対応済みは人数で数えている', stats.todayInbound > stats.todayResolved, { 受信: stats.todayInbound, 対応済み: stats.todayResolved })
  check('返信済みでも要確認・対応中には数える', stats.needsCheck === 2 && stats.inProgress === 2, { 要確認: stats.needsCheck, 対応中: stats.inProgress })

  console.log('\n③ 担当者別の集計')
  const rows = await prisma.customer.findMany({
    where: { conversation: { replyState: ReplyState.AWAITING } },
    select: { assigneeId: true },
  })
  eq('行数（担当者未設定を1行として含む）', stats.byAssignee.length, new Set(rows.map((r) => r.assigneeId ?? '__none__')).size)
  eq('合計が未返信合計と一致', stats.byAssignee.reduce((a, b) => a + b.count, 0), stats.awaitingTotal)
  check('件数の多い順に並ぶ', stats.byAssignee.every((r, i, all) => i === 0 || all[i - 1]!.count >= r.count), stats.byAssignee)
  check('担当者未設定に名前が入る', stats.byAssignee.some((r) => r.assigneeId === null && r.assigneeName === '担当者未設定'), stats.byAssignee)

  console.log('\n④ Cronの死活')
  check('直近の実行時刻を拾える', stats.cron.lastRunAt !== null)
  check('20分以内なら正常と判定する', stats.cron.healthy === true, stats.cron)

  console.log(`\n${failures === 0 ? '✅ 全項目 合格' : `❌ ${failures} 件 失敗`}`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    failures += 1
    console.log(`  ❌ ${label}`, detail ?? '')
  }
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
