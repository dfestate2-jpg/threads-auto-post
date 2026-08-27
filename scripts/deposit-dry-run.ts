/**
 * 本番に書き込む前の疎通確認。
 *
 *   npx tsx scripts/deposit-dry-run.ts
 *
 * - freee から入金明細を取得できるか
 * - 摘要から入金者名を正しく取り出せているか
 * - Google スプレッドシートを読めるか（＝共有設定ができているか）
 * - どの行が追記される予定か
 *
 * **一切書き込まない。** 表示された内容に納得してから Cron を有効化すること。
 */

import './loadEnv'

import { formatInTimeZone } from 'date-fns-tz'

import {
  FIRST_DATA_ROW,
  buildDepositRows,
  dateKeyOfDeposit,
  lastDateKeyOf,
  monthlySheetTitle,
  parseExistingRows,
} from '../src/lib/domain/depositSheet'
import { extractPayerName } from '../src/lib/domain/payerName'
import { env } from '../src/lib/env'
import { listIncomeWalletTxns, listWalletables } from '../src/lib/freee/client'
import { listSheets, readValues } from '../src/lib/sheets/client'

async function main(): Promise<void> {
  const now = new Date()
  const timezone = env.depositTimezone
  const today = formatInTimeZone(now, timezone, 'yyyy-MM-dd')
  const lookbackStart = formatInTimeZone(
    new Date(now.getTime() - env.depositLookbackDays * 86_400_000),
    timezone,
    'yyyy-MM-dd',
  )
  const startDate = lookbackStart > env.depositSyncStartDate ? lookbackStart : env.depositSyncStartDate

  console.log(`対象期間: ${startDate} 〜 ${today}（事業所 ${env.freeeCompanyId}）\n`)

  let walletableIds = env.freeeWalletableIds
  if (walletableIds.length === 0) {
    const walletables = await listWalletables(env.freeeCompanyId)
    walletableIds = walletables.filter((w) => w.type === 'bank_account').map((w) => w.id)
    console.log(`対象口座（自動検出）: ${walletableIds.join(', ') || '（銀行口座が見つかりません）'}\n`)
  } else {
    console.log(`対象口座（FREEE_WALLETABLE_IDS）: ${walletableIds.join(', ')}\n`)
  }

  const txns = []
  for (const walletableId of walletableIds) {
    txns.push(
      ...(await listIncomeWalletTxns({
        companyId: env.freeeCompanyId,
        walletableId,
        startDate,
        endDate: today,
      })),
    )
  }

  const deposits = txns
    .filter((t) => t.date >= env.depositSyncStartDate && t.amount >= env.depositMinAmount)
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))

  console.log(`freee から取得した入金: ${txns.length}件 / 取り込み対象: ${deposits.length}件\n`)
  console.log('摘要 → 入金者名の変換結果:')
  for (const txn of deposits) {
    const payer = extractPayerName(txn.description ?? '', { corporate: env.depositCorporateMode })
    console.log(`  ${txn.date}  ${String(txn.amount).padStart(10)}  ${txn.description}  →  ${payer}`)
  }

  const sheets = await listSheets()
  console.log(`\nスプレッドシートのシート一覧: ${sheets.map((s) => s.title).join(' / ')}`)

  const byTitle = new Map<string, typeof deposits>()
  for (const txn of deposits) {
    const title =
      env.depositFixedSheetTitle ?? monthlySheetTitle(new Date(`${txn.date}T00:00:00.000Z`), timezone)
    const list = byTitle.get(title)
    if (list) list.push(txn)
    else byTitle.set(title, [txn])
  }

  for (const [title, list] of [...byTitle.entries()].sort()) {
    const exists = sheets.some((s) => s.title === title)
    console.log(`\n--- シート「${title}」${exists ? '' : '（未作成 → テンプレートから作成されます）'}`)
    let lastDateKey: string | null = null
    if (exists) {
      const raw = await readValues(title, `A${FIRST_DATA_ROW}:F`)
      const existing = parseExistingRows(raw, FIRST_DATA_ROW)
      lastDateKey = lastDateKeyOf(existing)
      console.log(`既存データ行数: ${existing.filter((r) => r.hasValue).length}（最終行の入金日: ${lastDateKey ?? '-'}）`)
    }

    const built = buildDepositRows(
      list.map((txn) => ({
        id: String(txn.id),
        depositDate: new Date(`${txn.date}T00:00:00.000Z`),
        payerName: extractPayerName(txn.description ?? '', { corporate: env.depositCorporateMode }),
        amount: txn.amount,
      })),
      { timezone, omitRepeatedDate: env.depositOmitRepeatedDate, lastExistingDateKey: lastDateKey },
    )

    console.log('追記される予定の行（A列:入金日 / C列:入金者 / D列:入金額。B・E・F列は空のまま）:')
    for (const row of built.values) {
      console.log(`  [${row[0]}] [${row[2]}] [${row[3]}]`)
    }
  }

  console.log('\n※ このスクリプトは一切書き込んでいません。')
  console.log('   すでにシートへ手入力済みの入金が上の一覧に含まれていたら、')
  console.log('   DEPOSIT_SYNC_START_DATE を「手入力済みの最終日の翌日」に設定し直してください。\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
