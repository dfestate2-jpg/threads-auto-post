/**
 * 追客管理の結合確認スクリプト。
 *
 * 実データベースに対して「営業マンが1クリックしたら次回追客日が自動で決まる」
 * 「放置された顧客が自動で休眠になる」「返信が来たら復活する」といった
 * 中核の動きを、実際のトランザクションを通して検証する。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/followup-check.ts
 *
 * 外部サービス（LINE / Slack）には接続しない。
 */
import { ActionType, CustomerStatus, FollowUpSource, PrismaClient, ReplyState } from '@prisma/client'

import { ensureBaselineData } from '../src/lib/services/bootstrap'
import { loadPolicyContext } from '../src/lib/services/context'
import { recordInboundMessage } from '../src/lib/services/conversation'
import { loadFollowUpContext, onCustomerInbound, recordFollowUpAction } from '../src/lib/services/followUp'
import { runFollowUpJob } from '../src/lib/services/followUpRunner'
import { getTodayList } from '../src/lib/services/todayList'
import { getAdminOverview } from '../src/lib/services/salesStats'

process.env.SESSION_SECRET ??= 'followup-check-secret'
process.env.CRON_SECRET ??= 'followup-check-cron'

const prisma = new PrismaClient()
const DAY = 86_400_000
const TZ = 'Asia/Tokyo'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    failures += 1
    console.log(`  ❌ ${label}`, detail ?? '')
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
  await ensureBaselineData(prisma)
}

/** 顧客を作る。ステータス開始時刻を過去にずらして「時間が経った状態」を作れる */
async function createCustomer(name: string, status: CustomerStatus, statusSinceAgoDays: number, extra: Record<string, unknown> = {}) {
  const statusSince = new Date(Date.now() - statusSinceAgoDays * DAY)
  const customer = await prisma.customer.create({
    data: {
      name,
      status,
      statusSince,
      inquiredAt: statusSince,
      lastContactAt: statusSince,
      followUpStep: 0,
      ...extra,
    },
  })
  // 登録直後と同じ状態にするため、次回アクションを計算して入れる
  const ctx = await loadFollowUpContext()
  await recordFollowUpAction(
    {
      customerId: customer.id,
      actionType: ActionType.OTHER,
      nextStatus: status,
      occurredAt: statusSince,
      touchContact: false,
      source: FollowUpSource.AUTO,
    },
    ctx,
  )
  return prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })
}

async function main(): Promise<void> {
  console.log('追客管理 結合確認\n')
  await reset()

  // -------------------------------------------------------------------------
  console.log('① 顧客登録と同時に次回アクションが決まる')
  const staff = await prisma.staff.create({ data: { name: '営業テスト担当' } })
  const rookie = await createCustomer('新規 太郎', CustomerStatus.NEW_INQUIRY, 0, { assigneeId: staff.id })
  check('新規反響に次回アクションが自動設定される', rookie.nextActionAt !== null, rookie.nextActionAt)
  check('最初のアクションは電話', rookie.nextActionType === ActionType.CALL, rookie.nextActionType)
  check('営業マンは追客日を入力していない（システムが決めた）', rookie.followUpStep === 0)

  // -------------------------------------------------------------------------
  console.log('\n② 1クリックの記録で次のステップへ進む')
  const ctx = await loadFollowUpContext()
  const afterCall = await recordFollowUpAction(
    { customerId: rookie.id, staffId: staff.id, actionType: ActionType.CALL, result: '電話：応答あり' },
    ctx,
  )
  const rookie2 = await prisma.customer.findUniqueOrThrow({ where: { id: rookie.id } })
  check('次回アクションが次の段階へ進む', rookie2.followUpStep === 1 && rookie2.nextActionType === ActionType.LINE, rookie2.nextActionType)
  check('最終接触日時が自動更新される', rookie2.lastContactAt !== null && rookie2.lastContactAt.getTime() > rookie.statusSince.getTime())
  check('追客履歴が1件積まれる', (await prisma.followUpLog.count({ where: { customerId: rookie.id, actionType: ActionType.CALL } })) === 1)
  check('返り値に次回アクションが入る', afterCall?.nextActionAt !== null)

  // -------------------------------------------------------------------------
  console.log('\n③ ステータスを変えると、そのステータスの追客リズムが始まる')
  const quoted = await recordFollowUpAction(
    { customerId: rookie.id, staffId: staff.id, actionType: ActionType.QUOTE, nextStatus: CustomerStatus.AWAITING_QUOTE, result: '見積書を依頼' },
    await loadFollowUpContext(),
  )
  const rookie3 = await prisma.customer.findUniqueOrThrow({ where: { id: rookie.id } })
  check('ステータスが見積書待ちになる', rookie3.status === CustomerStatus.AWAITING_QUOTE)
  check('ステップが最初に戻る', rookie3.followUpStep === 0)
  check(
    '次回アクションは24時間後（見積書待ちのルール）',
    Math.round(((rookie3.nextActionAt?.getTime() ?? 0) - rookie3.statusSince.getTime()) / 3_600_000) === 24,
    rookie3.nextActionAt,
  )
  check('履歴にステータス遷移が残る', quoted?.status === CustomerStatus.AWAITING_QUOTE)

  // -------------------------------------------------------------------------
  console.log('\n④ 期限を過ぎた顧客が「今日やること」に必ず出る')
  const overdueCustomer = await createCustomer('期限 超過子', CustomerStatus.PROPOSING, 10, { assigneeId: staff.id })
  const todayCustomer = await createCustomer('今日 対応太', CustomerStatus.VIEWED, 0, { assigneeId: staff.id })
  const futureCustomer = await createCustomer('自動 追客子', CustomerStatus.DORMANT, 0, { assigneeId: staff.id })

  await runFollowUpJob(new Date())
  const list = await getTodayList({ timezone: TZ, assigneeId: staff.id })
  check('期限超過に入る', list.overdue.some((r) => r.id === overdueCustomer.id), list.overdue.map((r) => r.name))
  check('期限超過の日数が出る', (list.overdue.find((r) => r.id === overdueCustomer.id)?.overdueDays ?? 0) >= 1)
  check(
    '内見当日フォローは今日やることに入る',
    [...list.top, ...list.normal].some((r) => r.id === todayCustomer.id),
    [...list.top, ...list.normal].map((r) => r.name),
  )
  check('期限が先の顧客は件数だけ（自動追客中）', list.autoCount >= 1 && !list.overdue.some((r) => r.id === futureCustomer.id))
  check('理由が一言で分かる', (list.overdue.find((r) => r.id === overdueCustomer.id)?.reason ?? '').includes('物件提案中'))

  // 担当者ごとの絞り込み：他人の顧客が混ざると「自分の今日やること」が信用できなくなる
  const other = await prisma.staff.create({ data: { name: '別の営業' } })
  const otherCustomer = await createCustomer('他担当 の客', CustomerStatus.PROPOSING, 10, { assigneeId: other.id })
  const unassigned = await createCustomer('担当 未設定', CustomerStatus.PROPOSING, 10)
  const mine = await getTodayList({ timezone: TZ, assigneeId: staff.id, includeUnassigned: true })
  check('他の担当者の顧客は自分の画面に出ない', !mine.overdue.some((r) => r.id === otherCustomer.id), mine.overdue.map((r) => r.name))
  check('担当者未設定の顧客は拾う（取りこぼさない）', mine.overdue.some((r) => r.id === unassigned.id))
  const everyone = await getTodayList({ timezone: TZ })
  check('全担当者表示では他の担当者の顧客も出る', everyone.overdue.some((r) => r.id === otherCustomer.id))

  // -------------------------------------------------------------------------
  console.log('\n⑤ 放置された顧客は自動で休眠になる【指示書 13】')
  const abandoned = await createCustomer('返信 無男', CustomerStatus.NO_REPLY, 31, { assigneeId: staff.id })
  check('休眠化の前は返信なし', abandoned.status === CustomerStatus.NO_REPLY)
  // 30日ぶんのステップを消化した状態にしてから実行する
  await prisma.customer.update({ where: { id: abandoned.id }, data: { followUpStep: 4 } })
  await prisma.customer.update({
    where: { id: abandoned.id },
    data: { nextActionAt: new Date(Date.now() - 1000) },
  })
  const firstRun = await runFollowUpJob(new Date())
  const dormant = await prisma.customer.findUniqueOrThrow({ where: { id: abandoned.id } })
  check('30日反応が無ければ休眠へ自動遷移する', dormant.status === CustomerStatus.DORMANT, dormant.status)
  check('自動遷移が履歴に残る', (await prisma.followUpLog.count({ where: { customerId: abandoned.id, source: 'AUTO' } })) >= 1)
  check('休眠後も次回アクション（掘り起こし）が設定される', dormant.nextActionAt !== null, dormant.nextActionAt)
  check('遷移件数が実行結果に出る', firstRun.transitioned >= 1, firstRun)

  const secondRun = await runFollowUpJob(new Date())
  check('同じ遷移を二度実行しない（冪等）', secondRun.transitioned === 0, secondRun)

  // -------------------------------------------------------------------------
  console.log('\n⑥ 顧客から返信が来たら追客対象として復活する')
  await onCustomerInbound(dormant.id, new Date(), await loadFollowUpContext())
  const revived = await prisma.customer.findUniqueOrThrow({ where: { id: dormant.id } })
  check('休眠から初回対応済へ戻る', revived.status === CustomerStatus.FIRST_CONTACTED, revived.status)
  check('優先度が最優先になる', revived.priority === 'S', revived.priority)
  check('返信が履歴に残る', (await prisma.followUpLog.count({ where: { customerId: dormant.id, source: 'LINE_INBOUND' } })) === 1)

  // -------------------------------------------------------------------------
  console.log('\n⑦ 未返信リマインドと連動する（LINE受信 → 返信する、が最優先になる）')
  const lineCustomer = await prisma.customer.create({
    data: { name: 'LINE 花子', lineUserId: `U${Date.now()}`, status: CustomerStatus.PROPOSING, assigneeId: staff.id },
  })
  const inbound = await recordInboundMessage(
    {
      lineUserId: lineCustomer.lineUserId!,
      lineMessageId: `m-${Date.now()}`,
      messageType: 'text',
      text: 'この物件気になります',
      sentAt: new Date(),
    },
    await loadPolicyContext(),
  )
  await onCustomerInbound(inbound.customerId, new Date(), await loadFollowUpContext())
  const waiting = await prisma.customer.findUniqueOrThrow({
    where: { id: lineCustomer.id },
    include: { conversation: true },
  })
  check('未返信状態になる', waiting.conversation?.replyState === ReplyState.AWAITING)
  check('次回アクションが「返信する」になる', (waiting.nextActionNote ?? '').includes('返信'), waiting.nextActionNote)
  check('優先度が最優先', waiting.priority === 'S')
  const listAfterInbound = await getTodayList({ timezone: TZ, assigneeId: staff.id })
  const waitingRow = [...listAfterInbound.top, ...listAfterInbound.overdue].find((r) => r.id === lineCustomer.id)
  check('今日やることの最優先に出る', waitingRow !== undefined)
  // ステータス開始の経過ではなく、待たせている時間を出す（返信直後は前者が0になるため）
  check('理由に「未返信」と待たせている時間が出る', (waitingRow?.reason ?? '').startsWith('未返信'), waitingRow?.reason)

  // -------------------------------------------------------------------------
  console.log('\n⑧ 成約・失注で追客が止まる')
  await recordFollowUpAction(
    { customerId: todayCustomer.id, staffId: staff.id, actionType: ActionType.OTHER, nextStatus: CustomerStatus.CONTRACTED, result: '成約', contractAmount: 120000 },
    await loadFollowUpContext(),
  )
  const contracted = await prisma.customer.findUniqueOrThrow({ where: { id: todayCustomer.id } })
  check('成約後は次回アクションが無くなる', contracted.nextActionAt === null)
  check('成約日と金額が残る', contracted.contractedAt !== null && contracted.contractAmount === 120000)
  const listAfterContract = await getTodayList({ timezone: TZ, assigneeId: staff.id })
  check('今日やることから消える', !listAfterContract.overdue.concat(listAfterContract.top, listAfterContract.normal).some((r) => r.id === todayCustomer.id))

  // -------------------------------------------------------------------------
  console.log('\n⑨ 管理者の集計が追客履歴から作られる')
  const overview = await getAdminOverview({ timezone: TZ })
  const staffRow = overview.staff.find((s) => s.staffId === staff.id)
  check('担当者別の集計が出る', staffRow !== undefined)
  check('成約数が数えられる', (staffRow?.contracts ?? 0) === 1, staffRow)
  check('追客回数が数えられる', (staffRow?.followUps ?? 0) >= 2, staffRow)
  check('期限超過が数えられる', overview.overdue >= 1, overview.overdue)

  console.log(`\n${failures === 0 ? '✅ 全項目 合格' : `❌ ${failures} 件 失敗`}`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
