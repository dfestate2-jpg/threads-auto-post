/**
 * 一斉メール配信の結合確認スクリプト。
 *
 * 「配信停止した人に送らない」「同じ人に二度送らない」という中核要件は、
 * 行ロック（FOR UPDATE SKIP LOCKED）・UNIQUE制約・トランザクションに
 * 依存しており、モックでは検証できない。実DBに対して必ず流す。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/e2e-campaign.ts
 *
 * 送信は MAIL_PROVIDER 未設定時のドライランに落ちるため、外部へは接続しない。
 */
import { CampaignStatus, ConsentStatus, PrismaClient, RecipientStatus, SuppressionReason } from '@prisma/client'

import { queueCampaign } from '../src/lib/services/campaign'
import { runCampaignJob } from '../src/lib/services/campaignRunner'
import { addSuppression, unsubscribeContact } from '../src/lib/services/contacts'

// 配信停止リンクの署名と法定表示は本番と同じ経路で参照されるため、未設定なら検証用の値を入れる。
// MAIL_PROVIDER はあえて設定しない（ドライラン＝実送信なし）。
process.env.SESSION_SECRET ??= 'e2e-session-secret'
process.env.APP_BASE_URL ??= 'http://localhost:3000'
process.env.MAIL_FROM_ADDRESS ??= 'e2e@example.test'
process.env.MAIL_SENDER_ORG ??= 'E2E不動産'
process.env.MAIL_SENDER_ADDRESS ??= '東京都テスト区1-1-1'

const prisma = new PrismaClient()

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
  await prisma.campaignRecipient.deleteMany()
  await prisma.campaignProperty.deleteMany()
  await prisma.campaign.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.suppression.deleteMany()
  await prisma.property.deleteMany()
}

async function makeContacts(count: number, prefix: string): Promise<void> {
  await prisma.contact.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      email: `${prefix}${i}@example.test`,
      name: `テスト${i}`,
      consent: ConsentStatus.OPTED_IN,
      consentAt: new Date(),
      source: 'LINE_FORM' as const,
    })),
  })
}

async function makeCampaign(name: string): Promise<string> {
  const property = await prisma.property.create({
    data: { title: '検証用マンション', propertyType: 'MANSION', area: 'テスト区', price: 4980 },
  })
  const campaign = await prisma.campaign.create({
    data: {
      name,
      subject: '{{name}}様へ 新着物件のご案内',
      body: '{{name}}様\n\n{{properties}}\n\nよろしくお願いします。',
      segOptedInOnly: true,
      properties: { create: [{ propertyId: property.id, position: 0 }] },
    },
  })
  return campaign.id
}

async function main(): Promise<void> {
  const NOW = new Date()

  try {
    // ------------------------------------------------------------------
    console.log('\n【1】配信停止した人は対象に入らない')
    // ------------------------------------------------------------------
    await reset()
    await makeContacts(10, 'a')

    // 1人は本人が配信停止、1人はバウンスで停止台帳のみに載っている状態
    const [first, second] = await prisma.contact.findMany({ orderBy: { email: 'asc' }, take: 2 })
    await unsubscribeContact(first!.id, '検証')
    await addSuppression(second!.email, SuppressionReason.BOUNCED, '検証')

    const c1 = await makeCampaign('停止の除外')
    const q1 = await queueCampaign(c1, NOW)
    check('キュー登録が成功する', q1.ok === true, q1)
    check('停止した2人を除いた8件が対象になる', q1.ok && q1.total === 8, q1)

    const queued = await prisma.campaignRecipient.findMany({ where: { campaignId: c1 }, select: { address: true } })
    const addresses = new Set(queued.map((r) => r.address))
    check('本人が停止したアドレスがキューに無い', !addresses.has(first!.email))
    check('バウンスしたアドレスがキューに無い', !addresses.has(second!.email))

    // ------------------------------------------------------------------
    console.log('\n【2】対象確定のあとに停止した人へは送らない（送信直前の再判定）')
    // ------------------------------------------------------------------
    const survivor = await prisma.contact.findFirstOrThrow({
      where: { email: { in: [...addresses] } },
      orderBy: { email: 'asc' },
    })
    await unsubscribeContact(survivor.id, '対象確定後に停止')

    await runCampaignJob(new Date(NOW.getTime() + 1000))

    const afterRun = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: c1, contactId: survivor.id } })
    check('確定後に停止した人は SKIPPED になる', afterRun.status === RecipientStatus.SKIPPED, afterRun.status)
    check('その人には送信日時が入らない', afterRun.sentAt === null)

    const sent1 = await prisma.campaignRecipient.count({ where: { campaignId: c1, status: RecipientStatus.SENT } })
    check('残りの7件は送信済みになる', sent1 === 7, sent1)

    const done1 = await prisma.campaign.findUniqueOrThrow({ where: { id: c1 } })
    check('全件処理し終えたら SENT になる', done1.status === CampaignStatus.SENT, done1.status)
    check('集計が実際の件数と一致する', done1.sentCount === 7 && done1.skippedCount === 1, {
      sent: done1.sentCount,
      skipped: done1.skippedCount,
    })

    // ------------------------------------------------------------------
    console.log('\n【3】Cronが多重起動しても二重送信しない')
    // ------------------------------------------------------------------
    await reset()
    await makeContacts(40, 'b')
    const c2 = await makeCampaign('多重起動')
    await queueCampaign(c2, NOW)

    // 4本同時に走らせる。FOR UPDATE SKIP LOCKED が効いていれば取り合いにならない
    const runs = await Promise.all([
      runCampaignJob(new Date(NOW.getTime() + 2000)),
      runCampaignJob(new Date(NOW.getTime() + 2000)),
      runCampaignJob(new Date(NOW.getTime() + 2000)),
      runCampaignJob(new Date(NOW.getTime() + 2000)),
    ])

    const totalClaimed = runs.reduce((sum, r) => sum + r.claimed, 0)
    check('4本の実行が確保した合計が対象件数を超えない', totalClaimed <= 40, totalClaimed)

    const sent2 = await prisma.campaignRecipient.count({ where: { campaignId: c2, status: RecipientStatus.SENT } })
    check('40件すべてが送信済みになる', sent2 === 40, sent2)

    const rows2 = await prisma.campaignRecipient.findMany({ where: { campaignId: c2 }, select: { contactId: true } })
    check('受信者行が1人につき1行だけ', new Set(rows2.map((r) => r.contactId)).size === rows2.length)
    check('送信試行が1回を超えた行が無い',
      (await prisma.campaignRecipient.count({ where: { campaignId: c2, attempts: { gt: 1 } } })) === 0)

    // ------------------------------------------------------------------
    console.log('\n【4】同じ配信を二度キューに積んでも増えない（UNIQUE制約）')
    // ------------------------------------------------------------------
    await reset()
    await makeContacts(5, 'c')
    const c3 = await makeCampaign('再キュー')
    await queueCampaign(c3, NOW)
    await prisma.campaign.update({ where: { id: c3 }, data: { status: CampaignStatus.PAUSED } })
    const q3 = await queueCampaign(c3, NOW)

    check('2回目のキュー登録も成功する（再開のため）', q3.ok === true, q3)
    check('受信者は増えない', (await prisma.campaignRecipient.count({ where: { campaignId: c3 } })) === 5)

    // ------------------------------------------------------------------
    console.log('\n【5】確保したまま落ちても、リース切れで拾い直す')
    // ------------------------------------------------------------------
    await reset()
    await makeContacts(3, 'd')
    const c4 = await makeCampaign('リース回収')
    await queueCampaign(c4, NOW)

    // 送信処理の途中でプロセスが落ちた状態を作る（確保済みのまま放置）
    await prisma.campaignRecipient.updateMany({
      where: { campaignId: c4 },
      data: { claimedUntil: new Date(NOW.getTime() + 5 * 60_000) },
    })
    const blocked = await runCampaignJob(new Date(NOW.getTime() + 60_000))
    check('リース中は他の実行が掴まない', blocked.claimed === 0, blocked.claimed)

    // リースが切れた後
    const recovered = await runCampaignJob(new Date(NOW.getTime() + 6 * 60_000))
    check('リース切れ後は拾い直す', recovered.claimed === 3, recovered.claimed)
    check('3件とも送信済みになる',
      (await prisma.campaignRecipient.count({ where: { campaignId: c4, status: RecipientStatus.SENT } })) === 3)

    // ------------------------------------------------------------------
    console.log('\n【6】一時停止すると、それ以降は送られない')
    // ------------------------------------------------------------------
    await reset()
    await makeContacts(5, 'e')
    const c5 = await makeCampaign('一時停止')
    await queueCampaign(c5, NOW)
    await prisma.campaign.update({ where: { id: c5 }, data: { status: CampaignStatus.PAUSED } })

    const paused = await runCampaignJob(new Date(NOW.getTime() + 7000))
    check('停止中は1件も確保しない', paused.claimed === 0, paused.claimed)
    check('送信済みが0件のまま',
      (await prisma.campaignRecipient.count({ where: { campaignId: c5, status: RecipientStatus.SENT } })) === 0)

    // ------------------------------------------------------------------
    console.log('\n【7】停止台帳は配信先を作り直しても残る')
    // ------------------------------------------------------------------
    const target = await prisma.contact.findFirstOrThrow({ where: { email: { startsWith: 'e' } } })
    await unsubscribeContact(target.id, '検証')
    await prisma.contact.delete({ where: { id: target.id } })
    await prisma.contact.create({
      data: { email: target.email, name: '作り直し', consent: ConsentStatus.OPTED_IN, consentAt: new Date() },
    })

    const c6 = await makeCampaign('停止台帳の永続')
    const q6 = await queueCampaign(c6, NOW)
    const rows6 = await prisma.campaignRecipient.findMany({ where: { campaignId: c6 }, select: { address: true } })
    check('配信先を作り直しても、停止したアドレスは対象に入らない',
      !rows6.some((r) => r.address === target.email), { total: q6.ok ? q6.total : q6 })
  } finally {
    await prisma.$disconnect()
  }

  console.log(`\n${failures === 0 ? '✅ 全項目 合格' : `❌ ${failures} 件 失敗`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
