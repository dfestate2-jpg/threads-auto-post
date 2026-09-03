/**
 * 初期データ投入スクリプト。
 *
 * 通常はブラウザの初回セットアップ画面（/setup）を使うため、これは
 * 自動テストや、画面を使わずに構築したい場合の代替手段。
 * 処理の中身は services/bootstrap に集約してあり、画面と食い違わない。
 */
import { ChannelPurpose, ChannelType, PrismaClient } from '@prisma/client'

import { createAdminUser, ensureBaselineData } from '../src/lib/services/bootstrap'

const prisma = new PrismaClient()

async function main() {
  await ensureBaselineData(prisma)

  // --- 社内共通の通知先（環境変数が設定されていれば登録） ---
  const defaultChannels: { name: string; type: ChannelType; target: string | undefined }[] = [
    { name: '社内共通Slack', type: ChannelType.WEBHOOK, target: process.env.INTERNAL_SLACK_WEBHOOK_URL },
    { name: '社内共通LINEグループ', type: ChannelType.LINE_GROUP, target: process.env.INTERNAL_LINE_GROUP_ID },
  ]
  for (const c of defaultChannels) {
    if (!c.target) continue
    if (await prisma.notificationChannel.findFirst({ where: { target: c.target } })) continue
    await prisma.notificationChannel.create({
      data: { name: c.name, type: c.type, target: c.target, purpose: ChannelPurpose.DEFAULT_GROUP },
    })
  }

  // --- 初期管理者 ---
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!password) {
    console.warn('SEED_ADMIN_PASSWORD が未設定のため、管理者ユーザーを作成しませんでした')
    console.warn('ブラウザで /setup を開いて作成することもできます')
  } else {
    const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase()
    await createAdminUser(prisma, { name: '管理者', email, password })
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
