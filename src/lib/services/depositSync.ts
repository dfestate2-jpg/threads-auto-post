/**
 * 銀行入金 → スプレッドシート自動反映ジョブ。
 *
 *   freee 会計（銀行のAPI連携で取り込まれた口座明細）
 *     → 入金だけ抽出 → DBに確保（重複登録の防止） → 既存シートへ追記
 *
 * 「同じ入金を二度書かない」ための三段構え
 *   ① externalId の UNIQUE 制約 … 何度取得しても行は1つしか作られない
 *   ② PENDING → SYNCED の二相 … 追記できた分だけ確定させる
 *   ③ 末尾突合                 … 追記直後に落ちた分を次回に拾い直す
 *
 * 「取りこぼさない」ための作り
 *   - 毎回 lookback 日分をさかのぼって取得する（銀行の反映遅れを拾う）
 *   - 失敗した明細は FAILED のまま残り、次回の実行で再試行される
 */

import { DepositSyncStatus, Prisma } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'

import {
  FIRST_DATA_ROW,
  LAST_COLUMN,
  WRITE_COLUMN_RANGE,
  buildDepositRows,
  dateKeyOfDeposit,
  lastDateKeyOf,
  monthlySheetTitle,
  parseExistingRows,
  reconcileAppendedRows,
  type PendingDepositKey,
} from '@/lib/domain/depositSheet'
import { extractPayerName, payerNameKey } from '@/lib/domain/payerName'
import { env } from '@/lib/env'
import { listIncomeWalletTxns, listWalletables, type FreeeWalletTxn } from '@/lib/freee/client'
import { FreeeReauthorizationRequiredError } from '@/lib/freee/tokenStore'
import { prisma } from '@/lib/prisma'
import { appendValues, duplicateSheet, listSheets, parseRangeStartRow, readValues } from '@/lib/sheets/client'

const JOB_NAME = 'bank-deposit-sync'
/** リース時間。これを過ぎれば別の実行が引き継ぐ（落ちても止まらない） */
const LEASE_MINUTES = 10
/** 1回のAPI呼び出しで追記する行数の上限 */
const APPEND_CHUNK = 100

export interface DepositSyncSummary {
  /** freee から取得した入金明細の件数 */
  fetched: number
  /** 新規にDBへ取り込んだ件数 */
  inserted: number
  /** 下限金額・開始日により対象外にした件数 */
  skipped: number
  /** すでにシートに載っていたため追記しなかった件数 */
  reconciled: number
  /** シートへ追記した件数 */
  appended: number
  /** 追記に失敗した件数（次回再試行） */
  failed: number
  durationMs: number
  /** 他の実行が動いていたため何もしなかった */
  lockedOut?: boolean
  /** DEPOSIT_SYNC_ENABLED=0 で停止中 */
  disabled?: boolean
}

function emptySummary(): DepositSyncSummary {
  return { fetched: 0, inserted: 0, skipped: 0, reconciled: 0, appended: 0, failed: 0, durationMs: 0 }
}

// ---------------------------------------------------------------------------
// 多重起動の防止
// ---------------------------------------------------------------------------

/**
 * ジョブのリースを1文で確保する。
 * `WHERE lease_until < now` を満たした実行だけが行を更新できるため、
 * Cron が同時に複数起動しても実際に走るのは1つだけになる。
 */
async function acquireLock(now: Date, holder: string): Promise<boolean> {
  const leaseUntil = new Date(now.getTime() + LEASE_MINUTES * 60_000)
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    INSERT INTO job_locks ("name", "leaseUntil", "holder", "updatedAt")
    VALUES (${JOB_NAME}, ${leaseUntil}, ${holder}, ${now})
    ON CONFLICT ("name") DO UPDATE
      SET "leaseUntil" = EXCLUDED."leaseUntil",
          "holder"     = EXCLUDED."holder",
          "updatedAt"  = EXCLUDED."updatedAt"
      WHERE job_locks."leaseUntil" < ${now}
    RETURNING "name"
  `
  return rows.length > 0
}

async function releaseLock(now: Date, holder: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE job_locks SET "leaseUntil" = ${now}, "updatedAt" = ${now}
    WHERE "name" = ${JOB_NAME} AND "holder" = ${holder}
  `
}

// ---------------------------------------------------------------------------
// freee からの取得
// ---------------------------------------------------------------------------

/** yyyy-MM-dd を「その日のUTC 0時」にする。DATE 列に日付がずれずに入る */
function toDateColumn(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function externalIdOf(txn: FreeeWalletTxn): string {
  return `freee:${txn.company_id}:${txn.id}`
}

interface FetchResult {
  rows: Prisma.BankDepositCreateManyInput[]
  fetched: number
  skipped: number
}

async function fetchDeposits(now: Date): Promise<FetchResult> {
  const timezone = env.depositTimezone
  const companyId = env.freeeCompanyId

  const today = formatInTimeZone(now, timezone, 'yyyy-MM-dd')
  const lookbackStart = formatInTimeZone(
    new Date(now.getTime() - env.depositLookbackDays * 86_400_000),
    timezone,
    'yyyy-MM-dd',
  )
  // 導入前の明細を拾って手入力済みの行と重複させないよう、開始日で必ず切る
  const startDate = lookbackStart > env.depositSyncStartDate ? lookbackStart : env.depositSyncStartDate

  let walletableIds = env.freeeWalletableIds
  if (walletableIds.length === 0) {
    const walletables = await listWalletables(companyId)
    walletableIds = walletables.filter((w) => w.type === 'bank_account').map((w) => w.id)
  }

  const txns: FreeeWalletTxn[] = []
  if (walletableIds.length === 0) {
    txns.push(...(await listIncomeWalletTxns({ companyId, startDate, endDate: today })))
  } else {
    for (const walletableId of walletableIds) {
      txns.push(...(await listIncomeWalletTxns({ companyId, walletableId, startDate, endDate: today })))
    }
  }

  const rows: Prisma.BankDepositCreateManyInput[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const txn of txns) {
    const externalId = externalIdOf(txn)
    if (seen.has(externalId)) continue
    seen.add(externalId)

    if (txn.date < env.depositSyncStartDate) {
      skipped += 1
      continue
    }
    if (txn.amount < env.depositMinAmount) {
      skipped += 1
      continue
    }

    const description = txn.description ?? ''
    rows.push({
      source: 'freee',
      externalId,
      depositDate: toDateColumn(txn.date),
      payerName: extractPayerName(description, { corporate: env.depositCorporateMode }),
      rawDescription: description,
      amount: Math.round(txn.amount),
      walletableId: txn.walletable_id ?? null,
      companyId: txn.company_id ?? companyId,
      fetchedAt: now,
    })
  }

  return { rows, fetched: txns.length, skipped }
}

// ---------------------------------------------------------------------------
// シートへの反映
// ---------------------------------------------------------------------------

/** 反映先シートを用意する。無ければテンプレート（「コピー」）を複製して作る */
async function ensureSheet(title: string): Promise<void> {
  const sheets = await listSheets()
  if (sheets.some((s) => s.title === title)) return

  const template = sheets.find((s) => s.title === env.depositTemplateSheetTitle)
  if (!template) {
    throw new Error(
      `シート「${title}」が無く、テンプレート「${env.depositTemplateSheetTitle}」も見つかりません`,
    )
  }
  // 月次シートは新しいものを右端に置く既存の並びに合わせる
  const insertIndex = Math.max(...sheets.map((s) => s.index)) + 1
  await duplicateSheet(template.sheetId, title, insertIndex)
}

interface PendingDeposit {
  id: string
  depositDate: Date
  payerName: string
  amount: number
}

function toPendingKey(deposit: PendingDeposit, timezone: string): PendingDepositKey {
  return {
    id: deposit.id,
    dateKey: dateKeyOfDeposit(deposit.depositDate, timezone),
    payerKey: payerNameKey(deposit.payerName),
    amount: deposit.amount,
  }
}

async function markSynced(entries: Array<{ id: string; row: number }>, title: string, now: Date): Promise<void> {
  if (entries.length === 0) return
  await prisma.$transaction(
    entries.map(({ id, row }) =>
      prisma.bankDeposit.update({
        where: { id },
        data: {
          status: DepositSyncStatus.SYNCED,
          sheetTitle: title,
          sheetRow: row,
          syncedAt: now,
          error: null,
        },
      }),
    ),
  )
}

async function markFailed(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return
  await prisma.bankDeposit.updateMany({
    where: { id: { in: ids } },
    data: {
      status: DepositSyncStatus.FAILED,
      attempts: { increment: 1 },
      error: message.slice(0, 500),
    },
  })
}

/** 1つのシートに対する反映。戻り値は {reconciled, appended} */
async function syncSheet(
  title: string,
  deposits: PendingDeposit[],
  now: Date,
): Promise<{ reconciled: number; appended: number }> {
  const timezone = env.depositTimezone

  await ensureSheet(title)

  const raw = await readValues(title, `A${FIRST_DATA_ROW}:${LAST_COLUMN}`)
  const existing = parseExistingRows(raw, FIRST_DATA_ROW)

  const pendingKeys = deposits.map((d) => toPendingKey(d, timezone))
  const { matched, remaining } = reconcileAppendedRows(pendingKeys, existing)
  await markSynced(matched, title, now)

  if (remaining.length === 0) return { reconciled: matched.length, appended: 0 }

  const byId = new Map(deposits.map((d) => [d.id, d]))
  const toAppend = remaining
    .map((key) => byId.get(key.id))
    .filter((d): d is PendingDeposit => d !== undefined)

  let lastDateKey = lastDateKeyOf(existing)
  let appended = 0

  // 追記は少しずつ行い、成功するたびに確定させる。
  // 途中で落ちても「確定済みの分」は次回に再追記されない。
  for (let offset = 0; offset < toAppend.length; offset += APPEND_CHUNK) {
    const chunk = toAppend.slice(offset, offset + APPEND_CHUNK)
    const built = buildDepositRows(chunk, {
      timezone,
      omitRepeatedDate: env.depositOmitRepeatedDate,
      lastExistingDateKey: lastDateKey,
    })

    const result = await appendValues(title, WRITE_COLUMN_RANGE, built.values)
    const startRow = parseRangeStartRow(result.updatedRange)
    if (startRow === null) {
      throw new Error(`追記後の範囲を解釈できませんでした: ${result.updatedRange}`)
    }

    await markSynced(
      built.ids.map((id, index) => ({ id, row: startRow + index })),
      title,
      now,
    )
    appended += chunk.length
    lastDateKey = dateKeyOfDeposit(chunk[chunk.length - 1]!.depositDate, timezone)
  }

  return { reconciled: matched.length, appended }
}

// ---------------------------------------------------------------------------
// ジョブ本体
// ---------------------------------------------------------------------------

export async function runDepositSyncJob(now: Date = new Date()): Promise<DepositSyncSummary> {
  const startedAt = Date.now()
  const summary = emptySummary()

  if (!env.depositSyncEnabled) {
    return { ...summary, disabled: true, durationMs: 0 }
  }

  const holder = `${process.pid}-${startedAt}`
  if (!(await acquireLock(now, holder))) {
    return { ...summary, lockedOut: true, durationMs: Date.now() - startedAt }
  }

  const run = await prisma.cronRun.create({ data: { job: JOB_NAME, startedAt: now } })

  try {
    // --- ① freee から取得してDBへ確保する（重複はUNIQUE制約が弾く） -----------
    const fetched = await fetchDeposits(now)
    summary.fetched = fetched.fetched
    summary.skipped = fetched.skipped

    if (fetched.rows.length > 0) {
      const created = await prisma.bankDeposit.createMany({ data: fetched.rows, skipDuplicates: true })
      summary.inserted = created.count
    }

    // --- ② 未反映分をシートへ追記する ---------------------------------------
    const pending = await prisma.bankDeposit.findMany({
      where: { status: { in: [DepositSyncStatus.PENDING, DepositSyncStatus.FAILED] } },
      orderBy: [{ depositDate: 'asc' }, { externalId: 'asc' }],
      take: env.depositMaxRowsPerRun,
      select: { id: true, depositDate: true, payerName: true, amount: true },
    })

    const groups = new Map<string, PendingDeposit[]>()
    for (const deposit of pending) {
      const title = env.depositFixedSheetTitle ?? monthlySheetTitle(deposit.depositDate, env.depositTimezone)
      const list = groups.get(title)
      if (list) list.push(deposit)
      else groups.set(title, [deposit])
    }

    // 月の古い順に処理する（シート内の並びが日付順になるように）
    for (const title of [...groups.keys()].sort()) {
      const deposits = groups.get(title) ?? []
      try {
        const result = await syncSheet(title, deposits, now)
        summary.reconciled += result.reconciled
        summary.appended += result.appended
        summary.failed += deposits.length - result.reconciled - result.appended
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error(`[deposit-sync] シート ${title} への反映に失敗`, message)
        // どこまで書けたか分からないので、確定できていない分だけを FAILED にする
        const stillPending = await prisma.bankDeposit.findMany({
          where: {
            id: { in: deposits.map((d) => d.id) },
            status: { in: [DepositSyncStatus.PENDING, DepositSyncStatus.FAILED] },
          },
          select: { id: true },
        })
        await markFailed(
          stillPending.map((d) => d.id),
          message,
        )
        summary.failed += stillPending.length
      }
    }

    summary.durationMs = Date.now() - startedAt
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        claimed: pending.length,
        sent: summary.appended,
        skipped: summary.skipped + summary.reconciled,
        failed: summary.failed,
      },
    })
    return summary
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await prisma.cronRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), failed: 1, error: message.slice(0, 500) },
    })
    if (e instanceof FreeeReauthorizationRequiredError) {
      // 人が再認可しないと復旧しない。ログに明示して気付けるようにする
      console.error('[deposit-sync] freee の再認可が必要です', message)
    }
    throw e
  } finally {
    await releaseLock(new Date(), holder)
  }
}
