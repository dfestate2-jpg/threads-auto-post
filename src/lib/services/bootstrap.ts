/**
 * 初回セットアップ。
 *
 * 「設定・エスカレーション・祝日の初期値を入れる」「最初の管理者を作る」を
 * seed スクリプトとブラウザ画面の両方から同じ手順で実行できるようにまとめている。
 * 二か所に同じ処理を書くと、片方だけ直して食い違うため。
 */
import { Prisma, PrismaClient, StaffRole, UserRole } from '@prisma/client'

import { hashPassword } from '@/lib/auth/password'
import { DEFAULT_BUSINESS_HOURS } from '@/lib/domain/businessHours'
import { seedDefaultSystems } from '@/lib/services/portal'
import { ensureFollowUpDefaults } from './followUpDefaults'

/** 依頼の例：1時間→担当者 / 3時間→担当者＋責任者 / 6時間→管理者 */
const DEFAULT_ESCALATION_RULES = [
  { name: '1時間：担当者へ通知', thresholdMinutes: 60, notifyAssignee: true, notifyManager: false, notifyAdmins: false, notifyGroup: false },
  { name: '3時間：担当者＋責任者へ通知', thresholdMinutes: 180, notifyAssignee: true, notifyManager: true, notifyAdmins: false, notifyGroup: false },
  { name: '6時間：管理者へエスカレーション', thresholdMinutes: 360, notifyAssignee: true, notifyManager: true, notifyAdmins: true, notifyGroup: true },
]

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

type Db = PrismaClient | Prisma.TransactionClient

/** 設定・エスカレーション・祝日の初期値を入れる。既存の値は上書きしない */
export async function ensureBaselineData(db: Db): Promise<void> {
  await db.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, businessHours: DEFAULT_BUSINESS_HOURS as unknown as Prisma.InputJsonValue },
    update: {},
  })

  for (const [i, r] of DEFAULT_ESCALATION_RULES.entries()) {
    await db.escalationRule.upsert({
      where: { thresholdMinutes: r.thresholdMinutes },
      create: { ...r, enabled: true, sortOrder: i },
      update: {},
    })
  }

  // 追客ルールとLINEテンプレートの初期値
  await ensureFollowUpDefaults(db)

  for (const [date, name] of HOLIDAYS_2026) {
    await db.businessHoliday.upsert({
      where: { date: new Date(`${date}T00:00:00Z`) },
      create: { date: new Date(`${date}T00:00:00Z`), name },
      update: { name },
    })
  }

  // 業務システムポータルの初期カード（既に1件でもあれば何もしない）
  await seedDefaultSystems(db)
}

export interface AdminInput {
  name: string
  email: string
  password: string
}

/** 管理者ユーザーと、それに対応する担当者を作る */
export async function createAdminUser(
  db: Db,
  input: AdminInput,
): Promise<{ id: string; email: string; staffId: string | null }> {
  const email = input.email.trim().toLowerCase()
  const staff = await db.staff.upsert({
    where: { email },
    create: { name: input.name, email, role: StaffRole.ADMIN },
    update: {},
  })
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: UserRole.ADMIN,
      staffId: staff.id,
    },
    update: {},
  })
  return { id: user.id, email: user.email, staffId: user.staffId }
}

/** 初回セットアップが未完了か（＝管理画面のユーザーが1人もいないか） */
export async function isSetupPending(db: Db): Promise<boolean> {
  return (await db.user.count()) === 0
}
