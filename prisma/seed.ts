import { ChannelPurpose, ChannelType, PrismaClient, StaffRole, UserRole } from '@prisma/client'

import { hashPassword } from '../src/lib/auth/password'
import { DEFAULT_BUSINESS_HOURS } from '../src/lib/domain/businessHours'

const prisma = new PrismaClient()

/** 2026年の日本の祝日（内閣府公表分）。運用時は毎年追加する */
const HOLIDAYS_2026: [string, string][] = [
  ['2026-01-01', '元日'],
  ['2026-01-12', '成人の日'],
  ['2026-02-11', '建国記念の日'],
  ['2026-02-23', '天皇誕生日'],
  ['2026-03-20', '春分の日'],
  ['2026-04-29', '昭和の日'],
  ['2026-05-03', '憲法記念日'],
  ['2026-05-04', 'みどりの日'],
  ['2026-05-05', 'こどもの日'],
  ['2026-05-06', '振替休日'],
  ['2026-07-20', '海の日'],
  ['2026-08-11', '山の日'],
  ['2026-09-21', '敬老の日'],
  ['2026-09-22', '国民の休日'],
  ['2026-09-23', '秋分の日'],
  ['2026-10-12', 'スポーツの日'],
  ['2026-11-03', '文化の日'],
  ['2026-11-23', '勤労感謝の日'],
]

async function main() {
  // --- 基本設定 ---
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, businessHours: DEFAULT_BUSINESS_HOURS as object },
    update: {},
  })

  // --- エスカレーション（依頼の例：1時間→担当者 / 3時間→担当者＋責任者 / 6時間→管理者） ---
  const rules = [
    { name: '1時間：担当者へ通知', thresholdMinutes: 60, notifyAssignee: true, notifyManager: false, notifyAdmins: false, notifyGroup: false },
    { name: '3時間：担当者＋責任者へ通知', thresholdMinutes: 180, notifyAssignee: true, notifyManager: true, notifyAdmins: false, notifyGroup: false },
    { name: '6時間：管理者へエスカレーション', thresholdMinutes: 360, notifyAssignee: true, notifyManager: true, notifyAdmins: true, notifyGroup: true },
  ]
  for (const [i, r] of rules.entries()) {
    await prisma.escalationRule.upsert({
      where: { thresholdMinutes: r.thresholdMinutes },
      create: { ...r, enabled: true, sortOrder: i },
      update: {},
    })
  }

  // --- 祝日 ---
  for (const [date, name] of HOLIDAYS_2026) {
    await prisma.businessHoliday.upsert({
      where: { date: new Date(`${date}T00:00:00Z`) },
      create: { date: new Date(`${date}T00:00:00Z`), name },
      update: { name },
    })
  }

  // --- 社内共通の通知先（環境変数が設定されていれば登録） ---
  // 既定は Slack。LINE グループ運用に切り替える場合は INTERNAL_LINE_GROUP_ID を設定する。
  const defaultChannels: { name: string; type: ChannelType; target: string | undefined }[] = [
    { name: '社内共通Slack', type: ChannelType.WEBHOOK, target: process.env.INTERNAL_SLACK_WEBHOOK_URL },
    { name: '社内共通LINEグループ', type: ChannelType.LINE_GROUP, target: process.env.INTERNAL_LINE_GROUP_ID },
  ]
  for (const c of defaultChannels) {
    if (!c.target) continue
    const exists = await prisma.notificationChannel.findFirst({ where: { target: c.target } })
    if (exists) continue
    await prisma.notificationChannel.create({
      data: { name: c.name, type: c.type, target: c.target, purpose: ChannelPurpose.DEFAULT_GROUP },
    })
  }

  // --- 初期管理者 ---
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!password) {
    console.warn('SEED_ADMIN_PASSWORD が未設定のため、管理者ユーザーを作成しませんでした')
  } else {
    const staff = await prisma.staff.upsert({
      where: { email },
      create: { name: '管理者', email, role: StaffRole.ADMIN },
      update: {},
    })
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: '管理者',
        passwordHash: await hashPassword(password),
        role: UserRole.ADMIN,
        staffId: staff.id,
      },
      update: {},
    })
    console.log(`管理者ユーザーを作成しました: ${email}`)
  }

  console.log('seed 完了')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
