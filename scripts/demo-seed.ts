/**
 * 動作確認用のデモデータ投入。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/demo-seed.ts
 *
 * 「今日やること」に期限超過・最優先・通常・自動追客中がひと通り並ぶ状態を作る。
 * 本番データベースでは実行しないこと（顧客データを追加してしまうため）。
 */
import { ActionType, CustomerStatus, FollowUpSource, PrismaClient } from '@prisma/client'

import { ensureBaselineData } from '../src/lib/services/bootstrap'
import { loadFollowUpContext, recomputeCustomer, recordFollowUpAction } from '../src/lib/services/followUp'

process.env.SESSION_SECRET ??= 'demo-seed-secret'

const prisma = new PrismaClient()
const DAY = 86_400_000

interface DemoCustomer {
  name: string
  status: CustomerStatus
  /** 何日前にそのステータスになったか */
  agoDays: number
  step: number
  area: string
  rent: number
  phone: string
  source: string
  timing: string
}

const DEMO: DemoCustomer[] = [
  { name: '青木 健一', status: CustomerStatus.AWAITING_QUOTE, agoDays: 3, step: 0, area: '三軒茶屋', rent: 130000, phone: '090-1111-0001', source: 'SUUMO', timing: '9月中旬' },
  { name: '井上 みゆき', status: CustomerStatus.NO_REPLY, agoDays: 5, step: 1, area: '中目黒', rent: 150000, phone: '090-1111-0002', source: '自社HP', timing: '10月上旬' },
  { name: '上村 亮', status: CustomerStatus.VIEWED, agoDays: 2, step: 0, area: '下北沢', rent: 110000, phone: '090-1111-0003', source: "HOME'S", timing: '9月末' },
  { name: '遠藤 さやか', status: CustomerStatus.PROPOSING, agoDays: 2, step: 0, area: '経堂', rent: 95000, phone: '090-1111-0004', source: 'SUUMO', timing: '11月' },
  { name: '大西 拓也', status: CustomerStatus.NEW_INQUIRY, agoDays: 0, step: 0, area: '祐天寺', rent: 105000, phone: '090-1111-0005', source: 'LINE', timing: '9月中' },
  { name: '加藤 由美', status: CustomerStatus.VIEWING_ARRANGING, agoDays: 1, step: 0, area: '池尻大橋', rent: 140000, phone: '090-1111-0006', source: '紹介', timing: '10月中旬' },
  { name: '木下 慎太郎', status: CustomerStatus.APPLIED, agoDays: 1, step: 0, area: '駒沢大学', rent: 160000, phone: '090-1111-0007', source: 'アットホーム', timing: '9月末' },
  { name: '小林 恵', status: CustomerStatus.DORMANT, agoDays: 40, step: 0, area: '用賀', rent: 90000, phone: '090-1111-0008', source: 'SUUMO', timing: '未定' },
  { name: '佐々木 亮介', status: CustomerStatus.PROPOSING, agoDays: 12, step: 2, area: '二子玉川', rent: 180000, phone: '090-1111-0009', source: '自社HP', timing: '12月' },
  { name: '鈴木 千夏', status: CustomerStatus.HEARING_DONE, agoDays: 0, step: 0, area: '桜新町', rent: 120000, phone: '090-1111-0010', source: 'SUUMO', timing: '10月' },
  // 次回追客日がまだ先＝「自動追客中」に入る顧客
  { name: '田村 洋平', status: CustomerStatus.FIRST_CONTACTED, agoDays: 0, step: 0, area: '成城学園前', rent: 200000, phone: '090-1111-0011', source: '紹介', timing: '来春' },
  { name: '内藤 彩', status: CustomerStatus.ON_HOLD, agoDays: 1, step: 0, area: '千歳船橋', rent: 85000, phone: '090-1111-0012', source: "HOME'S", timing: '未定' },
]

async function main(): Promise<void> {
  await ensureBaselineData(prisma)

  const staff =
    (await prisma.staff.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } })) ??
    (await prisma.staff.create({ data: { name: 'デモ担当', role: 'STAFF' } }))

  const ctx = await loadFollowUpContext()
  let created = 0

  for (const d of DEMO) {
    if (await prisma.customer.findFirst({ where: { name: d.name } })) continue
    const statusSince = new Date(Date.now() - d.agoDays * DAY)
    const customer = await prisma.customer.create({
      data: {
        name: d.name,
        phone: d.phone,
        assigneeId: staff.id,
        status: d.status,
        statusSince,
        inquiredAt: statusSince,
        lastContactAt: statusSince,
        inquirySource: d.source,
        desiredArea: d.area,
        desiredRent: d.rent,
        moveInTiming: d.timing,
        followUpStep: d.step,
      },
    })
    // 次回アクションと優先度を実際の計算経路で入れる
    await recordFollowUpAction(
      {
        customerId: customer.id,
        actionType: ActionType.OTHER,
        nextStatus: d.status,
        occurredAt: statusSince,
        touchContact: false,
        // 担当者別の成績を汚さないよう、投入分はシステム操作として記録する
        source: FollowUpSource.AUTO,
        result: 'デモデータ投入',
      },
      ctx,
    )
    if (d.step > 0) {
      // 追客が何度か進んだ状態を作る
      await prisma.customer.update({ where: { id: customer.id }, data: { followUpStep: d.step } })
      await recomputeCustomer(prisma, customer.id, ctx)
    }
    created += 1
  }

  console.log(`デモ顧客を ${created} 件登録しました（担当：${staff.name}）`)
  console.log('`npm run dev` を起動して http://localhost:3000 を開くと「今日やること」に並びます')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
