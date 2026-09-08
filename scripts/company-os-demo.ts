/**
 * Company OS の動作確認用データ投入。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/company-os-demo.ts
 *
 * 会社・立ち上げテンプレート・課題・意思決定・未決事項・会議ログ・株主・書類・KPI を
 * ひと通り作り、ダッシュボードに数字が並ぶ状態にする。
 * 本番データベースでは実行しないこと。
 */
import { PrismaClient } from '@prisma/client'

import { addDaysToKey, fromDateKey, toDateKey } from '../src/lib/company-os/date'
import { ensureBaselineData, createAdminUser } from '../src/lib/services/bootstrap'
import { ensureDashboardMetrics } from '../src/lib/services/companyOs/dashboard'
import { applyTemplate } from '../src/lib/services/companyOs/template'

process.env.SESSION_SECRET ??= 'demo-seed-secret'

const prisma = new PrismaClient()

const ADMIN = {
  name: 'デモ管理者',
  email: process.env.DEMO_EMAIL ?? 'admin@example.com',
  password: process.env.DEMO_PASSWORD ?? 'demo-password-1234',
}

async function main(): Promise<void> {
  await ensureBaselineData(prisma)
  const admin = await createAdminUser(prisma, ADMIN)

  const existing = await prisma.coCompany.findFirst({ where: { name: 'デモ株式会社' } })
  if (existing) {
    console.log('デモ会社は既に作成済みです:', existing.id)
    return
  }

  const company = await prisma.coCompany.create({
    data: {
      name: 'デモ株式会社',
      stage: 'PREPARING',
      industry: '不動産テック',
      vision: '不動産仲介の追客を、人の勘に頼らず仕組みで回せるようにする',
      purpose: '1. 不動産業向けソフトウェアの企画、開発及び販売\n2. 不動産の売買、賃貸、管理及びその仲介\n3. 前各号に附帯関連する一切の業務',
      fiscalMonth: 3,
      capital: 3_000_000n,
      address: '東京都渋谷区（仮）',
    },
  })

  const owner = await prisma.coMember.create({
    data: {
      companyId: company.id,
      userId: admin.id,
      name: ADMIN.name,
      email: ADMIN.email,
      role: 'OWNER',
      title: '代表取締役',
      isOfficer: true,
    },
  })
  const cofounder = await prisma.coMember.create({
    data: {
      companyId: company.id,
      name: '共同創業者',
      role: 'ADMIN',
      title: '取締役',
      department: '開発',
      isOfficer: true,
    },
  })

  await prisma.coShareholder.createMany({
    data: [
      { companyId: company.id, name: ADMIN.name, shares: 600, ratio: 60, amount: 1_800_000n },
      { companyId: company.id, name: '共同創業者', shares: 400, ratio: 40, amount: 1_200_000n },
    ],
  })

  await ensureDashboardMetrics(company.id)

  // 立ち上げテンプレート。開始日を60日前にして、期限超過と進行中が混ざる状態を作る
  const today = toDateKey(new Date(), 'UTC')
  const startedOn = fromDateKey(addDaysToKey(today, -60))
  const result = await applyTemplate(company.id, 'startup', { startOn: startedOn, ownerId: owner.id })
  console.log('立ち上げテンプレート:', result)

  // 序盤のタスクを完了にして、進捗が出ている状態にする
  const doneKeys = ['startup:company_name', 'startup:representative', 'startup:company_address', 'startup:shareholders', 'startup:capital', 'startup:purpose', 'startup:officers']
  await prisma.coTask.updateMany({
    where: { companyId: company.id, templateKey: { in: doneKeys } },
    data: { status: 'DONE', completedAt: new Date() },
  })
  await prisma.coTask.updateMany({
    where: { companyId: company.id, templateKey: { in: ['startup:articles', 'startup:business_plan'] } },
    data: { status: 'IN_PROGRESS', assigneeId: cofounder.id },
  })

  await prisma.coIssue.createMany({
    data: [
      {
        companyId: company.id,
        title: '100社になった場合のサポート体制',
        detail: '現在は創業者2名で対応している。契約が増えたときに問い合わせを捌けない。',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        area: 'CUSTOMER',
        ownerId: owner.id,
        cause: '一次対応を人手でしか行っていない',
        countermeasure: 'FAQとマニュアルを整備し、一次対応を自動化する',
        nextAction: '想定問い合わせを20件洗い出す',
        dueOn: fromDateKey(addDaysToKey(today, 21)),
      },
      {
        companyId: company.id,
        title: '法人口座の開設が想定より遅い',
        detail: '審査に4週間かかると案内された。入金導線が組めない。',
        severity: 'CRITICAL',
        status: 'ACTING',
        area: 'FINANCE',
        ownerId: owner.id,
        cause: '設立直後で実績が無く、事業計画の提出を求められている',
        countermeasure: 'ネット銀行と並行して申し込む',
        nextAction: 'ネット銀行2行に申込',
        dueOn: fromDateKey(addDaysToKey(today, 7)),
      },
      {
        companyId: company.id,
        title: '営業の属人化',
        severity: 'MEDIUM',
        status: 'OPEN',
        area: 'SALES',
        detail: '提案内容が担当者ごとに違い、再現できない。',
      },
    ],
  })

  await prisma.coDecision.createMany({
    data: [
      {
        companyId: company.id,
        title: '当面は2人で会社を立ち上げる',
        background: '資金調達をせずに始めるため、固定費を最小にする必要がある',
        reason: '初年度は開発と営業を創業者2名で回し、売上が立ってから採用する',
        decidedOn: fromDateKey(addDaysToKey(today, -55)) as Date,
        deciderId: owner.id,
        area: 'MANAGEMENT',
        important: true,
      },
      {
        companyId: company.id,
        title: '最初のターゲットは不動産仲介にする',
        background: '創業者が業界経験を持ち、課題と決裁者を把握している',
        reason: '初期の顧客獲得コストが最も低く、導入事例を早く作れる',
        decidedOn: fromDateKey(addDaysToKey(today, -50)) as Date,
        deciderId: owner.id,
        area: 'BUSINESS',
        important: true,
      },
      {
        companyId: company.id,
        title: '代表取締役はデモ管理者とする',
        decidedOn: fromDateKey(addDaysToKey(today, -58)) as Date,
        deciderId: owner.id,
        area: 'COMPANY',
        important: true,
      },
    ],
  })

  await prisma.coQuestion.create({
    data: {
      companyId: company.id,
      title: '料金体系を月額にするか従量にするか',
      point: '初期費用を取らない前提で、どちらが導入されやすいか',
      severity: 'HIGH',
      status: 'DISCUSSING',
      area: 'BUSINESS',
      ownerId: owner.id,
      dueOn: fromDateKey(addDaysToKey(today, 10)),
      recommendation: '月額固定で始め、大口だけ従量を用意する',
      options: [
        { label: '月額固定', pros: '売上が読める・請求が簡単', cons: '小規模には割高に見える' },
        { label: '従量課金', pros: '導入のハードルが低い', cons: '売上が読めない・請求処理が煩雑' },
      ],
    },
  })

  await prisma.coQuestion.create({
    data: {
      companyId: company.id,
      title: '採用を開始する時期',
      point: '売上がいくらになったら1人目を採るか',
      severity: 'MEDIUM',
      status: 'OPEN',
      area: 'HR',
      dueOn: fromDateKey(addDaysToKey(today, -3)),
    },
  })

  await prisma.coMeeting.create({
    data: {
      companyId: company.id,
      title: '第1回 経営会議',
      heldAt: new Date(Date.now() - 7 * 86_400_000),
      attendees: [ADMIN.name, '共同創業者'],
      agenda: '設立準備の進捗確認と、料金の方向性',
      minutes: `## 決定事項
・当面は2人で会社を立ち上げる
・最初のターゲットは不動産仲介にする

## タスク
・営業資料のドラフトを作る 担当:共同創業者 期限:${addDaysToKey(today, 14)}
・法人口座の申込書をそろえる

## 課題
・100社に増えたときのサポート体制が未定

## 未決事項
・料金プランを月額にするか従量にするか`,
    },
  })

  await prisma.coDocument.createMany({
    data: [
      { companyId: company.id, name: '定款（電子）', location: '税理士預かり', area: 'LEGAL' },
      { companyId: company.id, name: '賃貸借契約書（オフィス）', location: '金庫', area: 'LEGAL', expiresOn: fromDateKey(addDaysToKey(today, 20)) },
      { companyId: company.id, name: '役員報酬の決議書', area: 'COMPANY', visibility: 'OWNERS' },
    ],
  })

  // 経営数値。財務モジュールが入るまでは手入力の値がそのまま表示される
  const metrics: [string, number, number | null][] = [
    ['revenue_month', 480_000, 1_000_000],
    ['expense_month', 320_000, null],
    ['cash_balance', 2_400_000, null],
    ['deals', 6, 10],
    ['customers', 2, 5],
    ['contracts', 2, 5],
  ]
  for (const [key, current, target] of metrics) {
    await prisma.coObjective.updateMany({
      where: { companyId: company.id, metricKey: key },
      data: { currentValue: current, targetValue: target },
    })
  }

  await prisma.coObjective.create({
    data: {
      companyId: company.id,
      title: '初年度で顧客10社',
      description: '導入事例を作り、次の資金調達の材料にする',
      isKpi: true,
      unit: '社',
      targetValue: 10,
      currentValue: 2,
      area: 'SALES',
      periodLabel: '2026年度',
      ownerId: owner.id,
      dueOn: fromDateKey(addDaysToKey(today, 300)),
    },
  })

  console.log('デモデータを作成しました')
  console.log(`  会社ID: ${company.id}`)
  console.log(`  ログイン: ${ADMIN.email} / ${ADMIN.password}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
