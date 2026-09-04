/**
 * 追客の定期実行を手元から1回だけ走らせる。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/run-followups.ts
 *
 * 本番では /api/cron/followups を Cron から叩くが、
 * 動作確認のときはこちらのほうが手早い。
 */
import { PrismaClient } from '@prisma/client'

import { runFollowUpJob } from '../src/lib/services/followUpRunner'

process.env.SESSION_SECRET ??= 'run-followups-secret'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const result = await runFollowUpJob(new Date())
  console.log('追客Cronを実行しました', result)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
