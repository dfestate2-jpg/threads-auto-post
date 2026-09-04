/**
 * 実データベースに対する結合確認スクリプト。
 *
 * 「絶対に見逃さない」「二重通知しない」「返信済みなら止まる」という中核要件を、
 * 実際の DB トランザクション・行ロック・冪等キーを通して検証する。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/e2e-check.ts
 *
 * 通知は LINE ではなくローカルの受信サーバー（WEBHOOKチャネル）へ送るため、
 * 外部サービスに接続せずに配信経路まで含めて確認できる。
 */
import http from 'node:http'

import { ChannelPurpose, ChannelType, PrismaClient, ReplyState, ResolvedVia } from '@prisma/client'

import { DEFAULT_BUSINESS_HOURS } from '../src/lib/domain/businessHours'
import { loadPolicyContext } from '../src/lib/services/context'
import { loadFollowUpContext } from '../src/lib/services/followUp'
import { recordInboundMessage, recordOutboundMessage } from '../src/lib/services/conversation'
import { runReminderJob } from '../src/lib/services/reminderRunner'
import { applyQuickAction } from '../src/lib/services/quickAction'
import { buildAssignActionData, buildResolveActionData } from '../src/lib/line/quickAction'

// このスクリプトは DATABASE_URL だけで動くようにする。
// ボタンの署名鍵は本番と同じ経路（env.quickActionSecret）で参照されるため、未設定なら検証用の値を入れる。
process.env.SESSION_SECRET ??= 'e2e-session-secret'
process.env.QUICK_ACTION_SECRET ??= 'e2e-quick-action-secret'

const prisma = new PrismaClient()
const PORT = 4599
const received: string[] = []

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    failures += 1
    console.log(`  ❌ ${label}`, detail ?? '')
  }
}

function startCaptureServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received.push(body)
        res.writeHead(200).end('ok')
      })
    })
    server.listen(PORT, () => resolve(server))
  })
}

const MIN = 60_000

async function reset(): Promise<void> {
  await prisma.$transaction([
    prisma.reminder.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.cronRun.deleteMany(),
    prisma.notificationChannel.deleteMany(),
    prisma.escalationRule.deleteMany(),
    prisma.staff.deleteMany(),
  ])
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      businessHours: DEFAULT_BUSINESS_HOURS as object,
      respectBusinessHours: false, // 時刻を自由に動かして検証するため無効化
      defaultReminderIntervalMinutes: 60,
      firstReminderDelayMinutes: 60,
      maxSilenceGuardMinutes: 180,
    },
    update: {
      respectBusinessHours: false,
      defaultReminderIntervalMinutes: 60,
      firstReminderDelayMinutes: 60,
      maxSilenceGuardMinutes: 180,
      businessHours: DEFAULT_BUSINESS_HOURS as object,
    },
  })
  await prisma.notificationChannel.create({
    data: {
      name: 'テスト受信',
      type: ChannelType.WEBHOOK,
      target: `http://127.0.0.1:${PORT}/hook`,
      purpose: ChannelPurpose.DEFAULT_GROUP,
    },
  })
  received.length = 0
}

async function inbound(lineUserId: string, text: string, at: Date, messageId: string) {
  return recordInboundMessage(
    { lineUserId, lineMessageId: messageId, messageType: 'text', text, sentAt: at },
    await loadPolicyContext(at),
  )
}

async function main(): Promise<void> {
  const server = await startCaptureServer()
  const T0 = new Date('2026-08-24T01:00:00Z') // JST 10:00 月曜

  try {
    // ---------------------------------------------------------------------
    console.log('\n① 顧客メッセージ受信 → 未返信として管理される')
    await reset()
    const r1 = await inbound('Ucustomer1', '〇〇について聞きたいです', T0, 'msg-1')
    check('未返信として計上される', r1.awaiting)
    check(
      '次回リマインドは受信の1時間後',
      r1.nextReminderAt?.toISOString() === new Date(T0.getTime() + 60 * MIN).toISOString(),
      r1.nextReminderAt,
    )

    // ---------------------------------------------------------------------
    console.log('\n② 1時間後に1回目、2時間後に2回目のリマインドが送られる')
    let s = await runReminderJob(new Date(T0.getTime() + 59 * MIN))
    check('59分時点では送られない', s.sent === 0, s)

    s = await runReminderJob(new Date(T0.getTime() + 60 * MIN))
    check('60分時点で1通送られる', s.sent === 1, s)
    check('通知本文が経過時間から始まる', received[0]?.includes('⚠️ 未返信 1時間') === true, received[0])
    check('通知本文に顧客と担当者が並ぶ', received[0]?.includes('（担当：') === true)
    check('通知本文に操作の案内がある', received[0]?.includes('返信したら下のボタンをタップしてください。') === true)
    check('顧客名と本文が載る', received[0]?.includes('『〇〇について聞きたいです』') === true, received[0])

    s = await runReminderJob(new Date(T0.getTime() + 120 * MIN))
    check('120分時点で2通目が送られる', s.sent === 1 && received.length === 2, { s, count: received.length })

    // ---------------------------------------------------------------------
    console.log('\n③ 同じ時刻にCronが多重起動しても二重通知しない')
    const before = received.length
    const results = await Promise.all([
      runReminderJob(new Date(T0.getTime() + 180 * MIN)),
      runReminderJob(new Date(T0.getTime() + 180 * MIN)),
      runReminderJob(new Date(T0.getTime() + 180 * MIN)),
    ])
    const sentTotal = results.reduce((a, b) => a + b.sent, 0)
    check('3並列でも送信は1通だけ', sentTotal === 1 && received.length === before + 1, {
      sentTotal,
      delta: received.length - before,
    })

    // ---------------------------------------------------------------------
    console.log('\n④ 担当者が返信すると対応済みになり、以降通知が止まる')
    const customer = await prisma.customer.findUniqueOrThrow({ where: { lineUserId: 'Ucustomer1' } })
    const T_reply = new Date(T0.getTime() + 210 * MIN)
    const out = await recordOutboundMessage(
      { customerId: customer.id, text: 'ご連絡ありがとうございます', sentAt: T_reply, source: 'ADMIN_CONSOLE', via: ResolvedVia.ADMIN_REPLY },
      await loadPolicyContext(T_reply),
      await loadFollowUpContext(T_reply),
    )
    check('未返信状態が解消される', out.stillAwaiting === false)
    check('次回リマインドが取り消される', out.nextReminderAt === null)

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { customerId: customer.id } })
    check('対応状況が「対応済み」になる', conv.handlingStatus === 'DONE', conv.handlingStatus)
    check('対応済み日時が記録される', conv.resolvedAt !== null)

    const countAfterReply = received.length
    for (const h of [4, 5, 6, 12, 24]) {
      await runReminderJob(new Date(T0.getTime() + h * 60 * MIN))
    }
    check('返信後は何時間経っても通知されない', received.length === countAfterReply, {
      delta: received.length - countAfterReply,
    })

    // ---------------------------------------------------------------------
    console.log('\n⑤ 顧客の追加メッセージでカウントが再スタートする【仕様①】')
    await reset()
    await inbound('Ucustomer2', '最初の質問です', T0, 'msg-2a')
    const r2 = await inbound('Ucustomer2', '追加の質問です', new Date(T0.getTime() + 40 * MIN), 'msg-2b')
    check(
      '次回リマインドが最新メッセージ基準へ後ろ倒しになる',
      r2.nextReminderAt?.toISOString() === new Date(T0.getTime() + 100 * MIN).toISOString(),
      r2.nextReminderAt,
    )
    s = await runReminderJob(new Date(T0.getTime() + 60 * MIN))
    check('元の予定時刻では送られない', s.sent === 0, s)
    s = await runReminderJob(new Date(T0.getTime() + 100 * MIN))
    check('再スタート後の予定時刻で送られる', s.sent === 1, s)

    // ---------------------------------------------------------------------
    console.log('\n⑥ 連投で通知が先送りされ続けても、保険で必ず通知される（見逃し防止）')
    await reset()
    await inbound('Ucustomer3', 'メッセージ1', T0, 'msg-3a')
    // 50分おきに送り続ける = 通常ロジックだけなら永久に1時間後が来ない
    for (const [i, offset] of [50, 100, 150, 200, 250].entries()) {
      await inbound('Ucustomer3', `メッセージ${i + 2}`, new Date(T0.getTime() + offset * MIN), `msg-3b${i}`)
    }
    let guardSent = 0
    for (let m = 0; m <= 300; m += 5) {
      const res = await runReminderJob(new Date(T0.getTime() + m * MIN))
      guardSent += res.sent
    }
    check('連投中でも通知が出る', guardSent > 0, { guardSent })
    const guardReminder = await prisma.reminder.findFirst({ where: { kind: 'GUARD' } })
    check('保険（GUARD）として記録される', guardReminder !== null)
    // 連投中は最新メッセージ基準だと数字が小さくなり軽く見える。実際の放置時間を出す
    check(
      '連投中でも実際の放置時間が出る',
      received.some((r) => r.includes('未返信 3時間（メッセージ連投中）')),
      received[0],
    )

    // ---------------------------------------------------------------------
    console.log('\n⑦ エスカレーションは1サイクル1回だけ発火する')
    await reset()
    await prisma.escalationRule.createMany({
      data: [
        { name: '1時間', thresholdMinutes: 60, notifyAssignee: true, notifyManager: false, notifyAdmins: false, notifyGroup: true, enabled: true },
        { name: '3時間', thresholdMinutes: 180, notifyAssignee: true, notifyManager: true, notifyAdmins: false, notifyGroup: true, enabled: true },
      ],
    })
    await inbound('Ucustomer4', 'エスカレーション確認', T0, 'msg-4a')
    for (let m = 0; m <= 300; m += 5) {
      await runReminderJob(new Date(T0.getTime() + m * MIN))
    }
    const escalations = await prisma.reminder.findMany({ where: { kind: 'ESCALATION' } })
    check('エスカレーションが2回（1時間・3時間）記録される', escalations.length === 2, escalations.map((e) => e.dedupeKey))
    const dupes = new Set(escalations.map((e) => e.dedupeKey))
    check('同じ段階が重複しない', dupes.size === escalations.length)

    // ---------------------------------------------------------------------
    console.log('\n⑧ Webhook の再送（同一メッセージID）は二重登録されない')
    await reset()
    await inbound('Ucustomer5', '重複確認', T0, 'msg-5a')
    const dup = await inbound('Ucustomer5', '重複確認', T0, 'msg-5a')
    check('重複として弾かれる', dup.duplicate === true)
    const msgCount = await prisma.message.count({ where: { customer: { lineUserId: 'Ucustomer5' } } })
    check('メッセージは1件しか保存されない', msgCount === 1, msgCount)

    // ---------------------------------------------------------------------
    console.log('\n⑨ 「通知しない」設定の顧客にはリマインドしない')
    await reset()
    await inbound('Ucustomer6', '通知OFF確認', T0, 'msg-6a')
    await prisma.customer.update({ where: { lineUserId: 'Ucustomer6' }, data: { reminderIntervalMinutes: 0 } })
    const c6 = await prisma.customer.findUniqueOrThrow({ where: { lineUserId: 'Ucustomer6' }, include: { conversation: true } })
    const { rescheduleConversation } = await import('../src/lib/services/conversation')
    await rescheduleConversation(c6.conversation!.id, await loadPolicyContext(T0))
    let offSent = 0
    for (let m = 0; m <= 300; m += 30) offSent += (await runReminderJob(new Date(T0.getTime() + m * MIN))).sent
    check('1通も送られない', offSent === 0, offSent)
    check('未返信状態としては残る（一覧で見える）', (await prisma.conversation.count({ where: { replyState: ReplyState.AWAITING } })) === 1)

    // ---------------------------------------------------------------------
    console.log('\n⑩ 営業時間外は翌営業日へ繰り延べられる')
    await reset()
    await prisma.appSettings.update({ where: { id: 1 }, data: { respectBusinessHours: true } })
    const evening = new Date('2026-08-24T10:30:00Z') // JST 19:30
    const r10 = await inbound('Ucustomer7', '営業時間確認', evening, 'msg-7a')
    check(
      '翌営業日の開店時刻（JST 9:00）に繰り延べられる',
      r10.nextReminderAt?.toISOString() === new Date('2026-08-25T00:00:00Z').toISOString(),
      r10.nextReminderAt,
    )
    const nightRun = await runReminderJob(new Date('2026-08-24T14:00:00Z')) // JST 23:00
    check('営業時間外には送られない', nightRun.sent === 0, nightRun)
    const morningRun = await runReminderJob(new Date('2026-08-25T00:05:00Z')) // JST 9:05
    check('翌営業日の朝に送られる', morningRun.sent === 1, morningRun)

    // ---------------------------------------------------------------------
    console.log('\n⑪ 社内LINE通知の「対応済みにする」ボタン')
    await reset()
    await prisma.appSettings.update({ where: { id: 1 }, data: { respectBusinessHours: false } })
    await prisma.notificationChannel.create({
      data: { name: '社内LINEグループ', type: ChannelType.LINE_GROUP, target: 'Ginternal', purpose: ChannelPurpose.DEFAULT_GROUP },
    })
    const staff = await prisma.staff.create({
      data: { name: '社内担当', email: 'quickaction@example.test', lineUserId: 'Ustaff-quick' },
    })

    await inbound('Ucustomer8', 'ボタン確認です', T0, 'msg-8a')
    const conv8 = await prisma.conversation.findFirstOrThrow({ where: { customer: { lineUserId: 'Ucustomer8' } } })
    const cycle8 = conv8.firstUnrepliedAt!.getTime()
    const secret = process.env.QUICK_ACTION_SECRET ?? process.env.SESSION_SECRET!
    const data8 = buildResolveActionData({ customerId: conv8.customerId, cycleId: cycle8 }, secret)!

    // 部外者（社内グループでも担当者でもない）のタップは受け付けない
    const outsider = await applyQuickAction(
      { data: data8, source: { type: 'user', userId: 'Uoutsider' } },
      await loadPolicyContext(T0),
    )
    check('社外・未登録アカウントのタップは拒否される', outsider.status === 'FORBIDDEN', outsider.status)
    check(
      '拒否されたので未返信のまま',
      (await prisma.conversation.findUniqueOrThrow({ where: { id: conv8.id } })).replyState === ReplyState.AWAITING,
    )

    // 署名が壊れたデータは無視する
    const forged = await applyQuickAction(
      { data: `${data8.slice(0, -1)}X`, source: { type: 'group', groupId: 'Ginternal', userId: staff.lineUserId! } },
      await loadPolicyContext(T0),
    )
    check('署名が改ざんされたデータは無視される', forged.status === 'INVALID', forged.status)

    // 社内グループからのタップで対応済みになる
    const tapped = await applyQuickAction(
      { data: data8, source: { type: 'group', groupId: 'Ginternal', userId: staff.lineUserId! } },
      await loadPolicyContext(T0),
    )
    check('社内グループからのタップで対応済みになる', tapped.status === 'RESOLVED', tapped)
    const conv8b = await prisma.conversation.findUniqueOrThrow({ where: { id: conv8.id } })
    check('返信済みに遷移する', conv8b.replyState === ReplyState.REPLIED, conv8b.replyState)
    check('リマインド予定が消える', conv8b.nextReminderAt === null, conv8b.nextReminderAt)
    check('解決経路がボタン操作として記録される', conv8b.resolvedVia === ResolvedVia.LINE_POSTBACK, conv8b.resolvedVia)
    check(
      '対応履歴に押した担当者が残る',
      (await prisma.message.count({ where: { conversationId: conv8.id, sentByStaffId: staff.id } })) === 1,
    )

    // 二度押ししても二重処理にならない
    const twice = await applyQuickAction(
      { data: data8, source: { type: 'group', groupId: 'Ginternal', userId: staff.lineUserId! } },
      await loadPolicyContext(T0),
    )
    check('二度押ししても二重処理にならない', twice.status === 'ALREADY_RESOLVED', twice.status)

    // 対応済み後はリマインドが1通も出ない
    let afterTap = 0
    for (let m = 60; m <= 600; m += 30) afterTap += (await runReminderJob(new Date(T0.getTime() + m * MIN))).sent
    check('対応済み後はリマインドが1通も出ない', afterTap === 0, afterTap)

    // 古い通知のボタンで、新しい未返信を閉じてしまわないこと。
    // ボタン操作は「今」記録されるため、次の問い合わせもそれより後の時刻で発生させる。
    await inbound('Ucustomer8', '追加の問い合わせです', new Date(Date.now() + 5 * MIN), 'msg-8b')
    const stale = await applyQuickAction(
      { data: data8, source: { type: 'group', groupId: 'Ginternal', userId: staff.lineUserId! } },
      await loadPolicyContext(T0),
    )
    check('古い通知のボタンでは新しい未返信を閉じられない', stale.status === 'STALE_CYCLE', stale.status)
    check(
      '新しい未返信は未返信のまま残る',
      (await prisma.conversation.findUniqueOrThrow({ where: { id: conv8.id } })).replyState === ReplyState.AWAITING,
    )


    // ---------------------------------------------------------------------
    console.log('\n⑫ 社内スタッフ本人の発言は顧客として扱わない')
    await reset()
    const insider = await prisma.staff.create({
      data: { name: '営業担当A', email: 'insider@example.test', lineUserId: 'Ustaff-insider' },
    })
    const { processLineEvents } = await import('../src/lib/services/lineWebhook')
    await processLineEvents(
      [
        {
          type: 'message',
          timestamp: T0.getTime(),
          source: { type: 'user', userId: insider.lineUserId! },
          webhookEventId: 'evt-insider-1',
          message: { id: 'msg-insider', type: 'text', text: 'テスト送信' },
        },
      ],
      'MAIN',
      await loadPolicyContext(T0),
      T0.getTime(),
    )
    check('顧客として登録されない', (await prisma.customer.count({ where: { lineUserId: insider.lineUserId! } })) === 0)
    check('未返信の会話が作られない', (await prisma.conversation.count()) === 0)

    // 社外の人は今までどおり顧客として扱う
    await processLineEvents(
      [
        {
          type: 'message',
          timestamp: T0.getTime(),
          source: { type: 'user', userId: 'Uoutside-customer' },
          webhookEventId: 'evt-outsider-1',
          message: { id: 'msg-outsider', type: 'text', text: 'お問い合わせです' },
        },
      ],
      'MAIN',
      await loadPolicyContext(T0),
      T0.getTime(),
    )
    check('社外の人は顧客として登録される', (await prisma.customer.count({ where: { lineUserId: 'Uoutside-customer' } })) === 1)
    check('未返信として追跡される', (await prisma.conversation.count({ where: { replyState: ReplyState.AWAITING } })) === 1)


    // ---------------------------------------------------------------------
    console.log('\n⑬ 担当者のLINE連携コード（社内通知チャネル）')
    await reset()
    const { issueLinkCode, consumeLinkCode } = await import('../src/lib/services/staffLink')
    const { hashLinkCode } = await import('../src/lib/domain/linkCode')
    const target = await prisma.staff.create({ data: { name: '営業担当B', email: 'link@example.test' } })

    const issued = await issueLinkCode(target.id, T0)
    check('平文コードはDBに保存されない', (await prisma.staffLinkCode.count({ where: { codeHash: issued.code } })) === 0)
    check('ハッシュで保存される', (await prisma.staffLinkCode.count({ where: { codeHash: hashLinkCode(issued.code) } })) === 1)

    const wrong = await consumeLinkCode('ZZZZ9999', 'Ustaff-B', T0)
    check('存在しないコードは紐づかない', wrong.status === 'NOT_FOUND', wrong.status)

    const chat = await consumeLinkCode('おつかれさまです', 'Ustaff-B', T0)
    check('コードを含まない発言には反応しない', chat.status === 'NO_CODE', chat.status)

    const linked = await consumeLinkCode(`登録 ${issued.code}`, 'Ustaff-B', T0)
    check('本文にコードが混ざっていても紐づく', linked.status === 'LINKED', linked)
    check(
      'LINEユーザーIDが担当者に登録される',
      (await prisma.staff.findUniqueOrThrow({ where: { id: target.id } })).lineUserId === 'Ustaff-B',
    )

    const reused = await consumeLinkCode(issued.code, 'Uattacker', T0)
    check('使用済みコードは再利用できない', reused.status === 'ALREADY_USED', reused.status)
    check(
      '再利用が拒否されても登録は書き換わらない',
      (await prisma.staff.findUniqueOrThrow({ where: { id: target.id } })).lineUserId === 'Ustaff-B',
    )

    const expiredIssue = await issueLinkCode(target.id, new Date(T0.getTime() - 48 * 60 * MIN))
    const expired = await consumeLinkCode(expiredIssue.code, 'Ustaff-B', T0)
    check('期限切れコードは紐づかない', expired.status === 'EXPIRED', expired.status)

    // 別の担当者が、既に他人が使っているLINEアカウントで登録しようとした場合
    const other = await prisma.staff.create({ data: { name: '営業担当C', email: 'link2@example.test' } })
    const otherIssue = await issueLinkCode(other.id, T0)
    const conflict = await consumeLinkCode(otherIssue.code, 'Ustaff-B', T0)
    check('他人に紐づけ済みのLINEアカウントは奪えない', conflict.status === 'ALREADY_LINKED_TO_OTHER', conflict.status)
    check(
      '奪われずに元の担当者のままになる',
      (await prisma.staff.findUniqueOrThrow({ where: { id: target.id } })).lineUserId === 'Ustaff-B',
    )

    // 発行し直すと前のコードは無効になる
    const first = await issueLinkCode(other.id, T0)
    const second = await issueLinkCode(other.id, T0)
    const staleCode = await consumeLinkCode(first.code, 'Ustaff-C', T0)
    check('再発行すると前のコードは無効になる', staleCode.status === 'NOT_FOUND', staleCode.status)
    const fresh = await consumeLinkCode(second.code, 'Ustaff-C', T0)
    check('最後に発行したコードで紐づく', fresh.status === 'LINKED', fresh.status)

    // 社内通知チャネルに来たメッセージを顧客として扱わない
    await processLineEvents(
      [
        {
          type: 'message',
          timestamp: T0.getTime(),
          source: { type: 'user', userId: 'Uunknown-internal' },
          webhookEventId: 'evt-notify-1',
          message: { id: 'msg-notify', type: 'text', text: 'これは社内チャネルへの発言' },
        },
      ],
      'NOTIFY',
      await loadPolicyContext(T0),
      T0.getTime(),
    )
    check('社内通知チャネルの発言は顧客にならない', (await prisma.customer.count()) === 0)
    check('社内通知チャネルの発言で会話が作られない', (await prisma.conversation.count()) === 0)


    // ---------------------------------------------------------------------
    console.log('\n⑭ 担当者だけでなく社内全員に同報される（事務も返信するため）')
    await reset()
    const salesA = await prisma.staff.create({
      data: { name: '営業A', email: 'sales-a@example.test', lineUserId: 'Usales-a' },
    })
    // 社内共通の通知先として「全員」を個別に登録する（LINEグループが使えない構成）
    for (const [name, target] of [['営業A', 'Usales-a'], ['営業B', 'Usales-b'], ['事務', 'Ujimu']] as const) {
      await prisma.notificationChannel.create({
        data: { name, type: ChannelType.LINE_USER, target, purpose: ChannelPurpose.DEFAULT_GROUP },
      })
    }
    const shared = await inbound('Ucustomer9', '内見の予約をしたいです', T0, 'msg-9a')
    await prisma.customer.update({
      where: { lineUserId: 'Ucustomer9' },
      data: { assigneeId: salesA.id },
    })
    const { rescheduleConversation: reschedule9 } = await import('../src/lib/services/conversation')
    await reschedule9(shared.conversationId, await loadPolicyContext(T0))
    await runReminderJob(new Date(T0.getTime() + 61 * MIN))

    const reminder9 = await prisma.reminder.findFirstOrThrow({
      where: { conversationId: shared.conversationId },
      orderBy: { createdAt: 'desc' },
    })
    const targets9 = (reminder9.targets as { target: string }[]).map((t) => t.target).sort()
    const lineTargets9 = targets9.filter((t) => t.startsWith('U'))
    check(
      '担当者・他の営業・事務の全員に届く',
      JSON.stringify(lineTargets9) === JSON.stringify(['Ujimu', 'Usales-a', 'Usales-b']),
      targets9,
    )
    check('担当者が共通の通知先にも入っているが二重にならない', targets9.filter((t) => t === 'Usales-a').length === 1)

    // 同報を切ると担当者だけになる
    await prisma.appSettings.update({ where: { id: 1 }, data: { alwaysNotifyDefaultGroup: false } })
    await runReminderJob(new Date(T0.getTime() + 121 * MIN))
    const reminder9b = await prisma.reminder.findFirstOrThrow({
      where: { conversationId: shared.conversationId },
      orderBy: { createdAt: 'desc' },
    })
    const targets9b = (reminder9b.targets as { target: string }[]).map((t) => t.target)
    check('設定を切ると担当者だけになる', JSON.stringify(targets9b) === JSON.stringify(['Usales-a']), targets9b)
    await prisma.appSettings.update({ where: { id: 1 }, data: { alwaysNotifyDefaultGroup: true } })

    // 事務が「対応済み」を押しても止まる（担当者でなくても操作できる）
    const conv9 = await prisma.conversation.findUniqueOrThrow({ where: { id: shared.conversationId } })
    const jimu = await prisma.staff.create({
      data: { name: '事務', email: 'jimu@example.test', lineUserId: 'Ujimu' },
    })
    const byJimu = await applyQuickAction(
      {
        data: buildResolveActionData(
          { customerId: conv9.customerId, cycleId: conv9.firstUnrepliedAt!.getTime() },
          process.env.QUICK_ACTION_SECRET!,
        )!,
        source: { type: 'user', userId: jimu.lineUserId! },
      },
      await loadPolicyContext(T0),
    )
    check('担当者以外（事務）でも対応済みにできる', byJimu.status === 'RESOLVED', byJimu)
    check(
      '対応済み後はリマインドが止まる',
      (await prisma.conversation.findUniqueOrThrow({ where: { id: shared.conversationId } })).nextReminderAt === null,
    )


    // ---------------------------------------------------------------------
    console.log('\n⑮ 社内LINE通知の「自分が担当にする」ボタン')
    await reset()
    await prisma.appSettings.update({ where: { id: 1 }, data: { respectBusinessHours: false } })
    await prisma.notificationChannel.create({
      data: { name: '社内LINEグループ', type: ChannelType.LINE_GROUP, target: 'Ginternal', purpose: ChannelPurpose.DEFAULT_GROUP },
    })
    const assigner = await prisma.staff.create({
      data: { name: '割当担当', email: 'assign@example.test', lineUserId: 'Ustaff-assign' },
    })
    const qsecret = process.env.QUICK_ACTION_SECRET ?? process.env.SESSION_SECRET!

    await inbound('Ucustomer13', '担当割当の確認です', T0, 'msg-13a')
    const conv13 = await prisma.conversation.findFirstOrThrow({ where: { customer: { lineUserId: 'Ucustomer13' } } })
    const assignData = buildAssignActionData(
      { customerId: conv13.customerId, cycleId: conv13.firstUnrepliedAt!.getTime() },
      qsecret,
    )!

    check(
      '割当前は担当者が未設定',
      (await prisma.customer.findUniqueOrThrow({ where: { id: conv13.customerId } })).assigneeId === null,
    )

    // 社内グループから、担当者として登録済みの人がタップする
    const assigned = await applyQuickAction(
      { data: assignData, source: { type: 'group', groupId: 'Ginternal', userId: 'Ustaff-assign' } },
      await loadPolicyContext(T0),
    )
    check('グループからのタップで担当者になる', assigned.status === 'ASSIGNED', assigned)
    check(
      '顧客の担当者が更新される',
      (await prisma.customer.findUniqueOrThrow({ where: { id: conv13.customerId } })).assigneeId === assigner.id,
    )

    // 担当を引き受けただけで、未返信を閉じてはいけない（見逃しに直結する）
    const conv13b = await prisma.conversation.findUniqueOrThrow({ where: { id: conv13.id } })
    check('担当割当では未返信のままになる', conv13b.replyState === ReplyState.AWAITING, conv13b.replyState)
    check('リマインド予定も消えない', conv13b.nextReminderAt !== null, conv13b.nextReminderAt)

    // 未登録アカウントが押しても、誰に割り当てるか決められない
    const notStaff = await applyQuickAction(
      { data: assignData, source: { type: 'group', groupId: 'Ginternal', userId: 'Uunknown-person' } },
      await loadPolicyContext(T0),
    )
    check('未登録アカウントのタップは担当者にできない', notStaff.status === 'NOT_STAFF', notStaff.status)
    check(
      '担当者は元のまま変わらない',
      (await prisma.customer.findUniqueOrThrow({ where: { id: conv13.customerId } })).assigneeId === assigner.id,
    )

    // 社外からのタップは、そもそも受け付けない
    const outsiderAssign = await applyQuickAction(
      { data: assignData, source: { type: 'user', userId: 'Uoutsider-assign' } },
      await loadPolicyContext(T0),
    )
    check('社外アカウントの担当割当は拒否される', outsiderAssign.status === 'FORBIDDEN', outsiderAssign.status)

    // 署名の対象に種別が入っているので、担当割当を「対応済み」に化けさせられない
    const forgedKind = await applyQuickAction(
      { data: assignData.replace('.A.', '.R.'), source: { type: 'group', groupId: 'Ginternal', userId: 'Ustaff-assign' } },
      await loadPolicyContext(T0),
    )
    check('種別を差し替えたデータは無視される', forgedKind.status === 'INVALID', forgedKind.status)
    check(
      '差し替えられても未返信のまま',
      (await prisma.conversation.findUniqueOrThrow({ where: { id: conv13.id } })).replyState === ReplyState.AWAITING,
    )


    // ---------------------------------------------------------------------
    console.log('\n⑯ 2回目以降のリマインドを1通にまとめる')
    await reset()
    await prisma.appSettings.update({
      where: { id: 1 },
      data: { respectBusinessHours: false, digestRepeatReminders: true },
    })
    await prisma.notificationChannel.create({
      data: { name: '社内LINEグループ', type: ChannelType.WEBHOOK, target: `http://127.0.0.1:${PORT}/hook`, purpose: ChannelPurpose.DEFAULT_GROUP },
    })

    for (const n of [1, 2, 3]) {
      await inbound(`Udigest${n}`, `まとめ確認${n}`, T0, `msg-16-${n}`)
    }

    received.length = 0
    const digestFirst = await runReminderJob(new Date(T0.getTime() + 60 * MIN))
    check('初回は3件が個別に送られる', digestFirst.sent === 3, digestFirst)
    check('初回の通知は3通', received.length === 3, received.length)
    check('初回にまとめ通知は出ない', !received.some((r) => r.includes('件（継続中）')), received[0])

    received.length = 0
    const digestSecond = await runReminderJob(new Date(T0.getTime() + 130 * MIN))
    check('2回目も3件とも送信済みとして処理される', digestSecond.sent === 3, digestSecond)
    check('2回目は1通にまとまる', received.length === 1, received.length)
    check('まとめ通知に3件すべて載る', received[0]?.includes('未返信 3件（継続中）') === true, received[0])
    for (const n of [1, 2, 3]) {
      check(`まとめ通知に${n}件目が含まれる`, received[0]?.includes(`Udigest${n}`) === true)
    }

    // まとめても予定と記録は1件ずつ進む＝取りこぼしが起きない
    const digestConvs = await prisma.conversation.findMany({
      where: { customer: { lineUserId: { startsWith: 'Udigest' } } },
    })
    check('まとめても回数は1件ずつ進む', digestConvs.every((c) => c.reminderCount === 2), digestConvs.map((c) => c.reminderCount))
    check('まとめても次回予定が入る', digestConvs.every((c) => c.nextReminderAt !== null))
    check(
      'まとめても記録は1件ずつ残る',
      (await prisma.reminder.count({ where: { conversationId: { in: digestConvs.map((c) => c.id) }, sequence: 2 } })) === 3,
    )

    // 1件だけ返信すると、次のまとめから外れる
    await recordOutboundMessage(
      {
        customerId: digestConvs[0]!.customerId,
        text: '返信しました',
        messageType: 'text',
        sentAt: new Date(T0.getTime() + 140 * MIN),
        source: 'ADMIN_UI',
        via: ResolvedVia.ADMIN_REPLY,
      },
      await loadPolicyContext(T0),
      await loadFollowUpContext(T0),
    )
    received.length = 0
    await runReminderJob(new Date(T0.getTime() + 200 * MIN))
    check('返信済みはまとめ通知から外れる', received.every((r) => !r.includes(digestConvs[0]!.customerId)), received[0])

  } finally {
    server.close()
    await prisma.$disconnect()
  }

  console.log(`\n${failures === 0 ? '✅ 全項目 合格' : `❌ ${failures} 件 失敗`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
