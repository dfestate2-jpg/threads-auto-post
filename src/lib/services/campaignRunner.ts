/**
 * 送信キューの消化。Cron から**1分ごと**に起動する。
 *
 * 3,000件を1リクエストで送り切ろうとするとタイムアウトし、
 * どこまで送ったか分からない状態になる。そのため
 *   「毎回すこしずつ確保して送る」「落ちても確保が自動で解ける」
 * という、リマインド処理（reminderRunner）と同じ作りにしてある。
 *
 *   - FOR UPDATE SKIP LOCKED で原子的に確保 → Cron が多重起動しても二重送信しない
 *   - claimedUntil を過ぎた確保は自動で解ける   → 送信中に落ちても取りこぼさない
 *   - (campaignId, contactId) の UNIQUE       → 最終防波堤
 */
import { CampaignChannel, CampaignStatus, RecipientStatus, SuppressionReason } from '@prisma/client'

import { env } from '@/lib/env'
import { MailSendError, getMailTransport, type MailTransport } from '@/lib/email/client'
import { renderMessage, type TemplateProperty } from '@/lib/email/template'
import { buildUnsubscribeUrl, createUnsubscribeToken } from '@/lib/email/unsubscribe'
import { prisma } from '@/lib/prisma'
import { loadCampaignProperties } from './campaign'
import { recordBounce } from './contacts'

/** 確保の有効期限（分）。送信中にプロセスが落ちても、この時間で拾い直される */
const CLAIM_LEASE_MINUTES = 5
/** リトライのバックオフ（分）。これを使い切ったら FAILED にする */
const RETRY_BACKOFF_MINUTES = [1, 5, 20] as const

export interface CampaignRunSummary {
  campaigns: number
  claimed: number
  sent: number
  /** リトライ上限まで失敗し、送信を諦めた件数 */
  failed: number
  /** 配信停止などで送らなかった件数 */
  skipped: number
  /** 一時的な失敗。次回の実行で再試行する */
  retry: number
  durationMs: number
}

interface ClaimedRow {
  id: string
  campaignId: string
  contactId: string
  address: string
  name: string | null
  attempts: number
}

/**
 * 送信可能な受信者を原子的に確保する。
 *
 * 「PENDING かつ nextAttemptAt 到来かつ（未確保 or 確保期限切れ）」を掴み、
 * 同じ文の中で claimedUntil を先へ延ばす。SKIP LOCKED があるので
 * 別プロセスが同じ行を掴むことはない。
 */
async function claimRecipients(now: Date, leaseUntil: Date, limit: number): Promise<ClaimedRow[]> {
  return prisma.$queryRaw<ClaimedRow[]>`
    WITH due AS (
      SELECT r.id
      FROM campaign_recipients r
      JOIN campaigns c ON c.id = r."campaignId"
      WHERE r.status = 'PENDING'
        AND r."nextAttemptAt" <= ${now}
        AND (r."claimedUntil" IS NULL OR r."claimedUntil" <= ${now})
        AND c.status IN ('QUEUED', 'SENDING')
        AND c.channel = 'EMAIL'
      ORDER BY r."nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE OF r SKIP LOCKED
    )
    UPDATE campaign_recipients r
    SET "claimedUntil" = ${leaseUntil}
    FROM due
    WHERE r.id = due.id
    RETURNING r.id, r."campaignId", r."contactId", r.address, r.name, r.attempts
  `
}

interface CampaignContext {
  id: string
  subject: string
  body: string
  properties: TemplateProperty[]
}

async function loadCampaignContext(campaignId: string): Promise<CampaignContext | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, subject: true, body: true },
  })
  if (!campaign) return null
  const properties = await loadCampaignProperties(campaignId)
  return {
    ...campaign,
    properties: properties.map((p) => ({
      title: p.title,
      propertyType: p.propertyType,
      area: p.area,
      address: p.address,
      price: p.price,
      layout: p.layout,
      sizeSqm: p.sizeSqm,
      stationAccess: p.stationAccess,
      description: p.description,
      url: p.url,
    })),
  }
}

/** 差出人情報が揃っているかを、送信を始める前に確認する（法定表示の欠落を防ぐ） */
export function assertSenderConfigured(): void {
  // getter が未設定時に例外を投げるので、参照するだけで検証になる
  void env.mailFromAddress
  void env.mailSenderOrg
  void env.mailSenderAddress
  if (!env.appBaseUrl) {
    throw new Error('APP_BASE_URL が未設定です（配信停止リンクを生成できません）')
  }
}

export function buildMailFor(
  campaign: CampaignContext,
  recipient: { contactId: string; address: string; name: string | null },
) {
  const token = createUnsubscribeToken({ c: recipient.contactId, k: campaign.id }, env.unsubscribeSecret)
  const unsubscribeUrl = buildUnsubscribeUrl(env.appBaseUrl, token)
  const rendered = renderMessage({
    subject: campaign.subject,
    body: campaign.body,
    recipient: { name: recipient.name },
    properties: campaign.properties,
    unsubscribeUrl,
    sender: { org: env.mailSenderOrg, address: env.mailSenderAddress, tel: env.mailSenderTel },
  })
  return { ...rendered, unsubscribeUrl }
}

type SendOutcome = 'sent' | 'failed' | 'skipped' | 'retry'

async function sendOne(
  row: ClaimedRow,
  campaign: CampaignContext,
  transport: MailTransport,
  now: Date,
): Promise<SendOutcome> {
  // --- 送信直前の再判定。ここが「送ってはいけない相手に送らない」最後の関門 ---
  const [contact, suppression] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: row.contactId },
      select: { consent: true, unsubscribedAt: true, active: true },
    }),
    prisma.suppression.findUnique({ where: { address: row.address }, select: { id: true } }),
  ])
  const blocked =
    !contact || !contact.active || contact.unsubscribedAt !== null || contact.consent === 'UNSUBSCRIBED' || suppression

  if (blocked) {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: {
        status: RecipientStatus.SKIPPED,
        claimedUntil: null,
        lastError: '送信直前の再判定で対象外（配信停止・バウンス済み）',
      },
    })
    return 'skipped'
  }

  const mail = buildMailFor(campaign, row)
  try {
    const result = await transport.send({
      to: row.address,
      toName: row.name,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      unsubscribeUrl: mail.unsubscribeUrl,
    })
    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: row.id },
        data: {
          status: RecipientStatus.SENT,
          sentAt: now,
          attempts: row.attempts + 1,
          claimedUntil: null,
          lastError: null,
          providerMessageId: result.messageId,
        },
      }),
      prisma.contact.update({ where: { id: row.contactId }, data: { lastSentAt: now } }),
    ])
    return 'sent'
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const attempts = row.attempts + 1
    const permanent = e instanceof MailSendError && e.permanent
    const backoff = RETRY_BACKOFF_MINUTES[attempts - 1]
    const giveUp = permanent || backoff === undefined

    // 宛先不明が確定した場合は、以後どの配信でも送らないよう台帳に載せる
    if (permanent && e instanceof MailSendError && e.status === 422) {
      await recordBounce(row.address, SuppressionReason.BOUNCED, `送信拒否 (${e.status})`)
    }

    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: {
        status: giveUp ? RecipientStatus.FAILED : RecipientStatus.PENDING,
        attempts,
        claimedUntil: null,
        nextAttemptAt: giveUp ? now : new Date(now.getTime() + backoff * 60_000),
        lastError: err.message.slice(0, 500),
      },
    })
    return giveUp ? 'failed' : 'retry'
  }
}

/** 一定数ずつ並行して送る。プロバイダのレート上限を超えないよう同時数を絞る */
async function sendWithConcurrency(
  rows: ClaimedRow[],
  contexts: Map<string, CampaignContext>,
  transport: MailTransport,
  now: Date,
  concurrency: number,
): Promise<Record<SendOutcome, number>> {
  const tally: Record<SendOutcome, number> = { sent: 0, failed: 0, skipped: 0, retry: 0 }
  let cursor = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++
      const row = rows[index]
      if (!row) return
      const campaign = contexts.get(row.campaignId)
      if (!campaign) {
        // 配信そのものが消えた。確保を解いて次の実行に判断を委ねる
        await prisma.campaignRecipient
          .update({ where: { id: row.id }, data: { claimedUntil: null } })
          .catch(() => undefined)
        tally.retry++
        continue
      }
      try {
        tally[await sendOne(row, campaign, transport, now)]++
      } catch (e) {
        // sendOne 内で処理しきれなかった想定外の例外。確保だけ解いて次の実行に任せる
        console.error('[campaign] unexpected send error', e)
        await prisma.campaignRecipient
          .update({ where: { id: row.id }, data: { claimedUntil: null } })
          .catch(() => undefined)
        tally.retry++
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker))
  return tally
}

/** 全件処理し終わった配信を SENT にする */
async function finalizeCampaigns(campaignIds: string[], now: Date): Promise<void> {
  for (const id of campaignIds) {
    const remaining = await prisma.campaignRecipient.count({
      where: { campaignId: id, status: RecipientStatus.PENDING },
    })
    const counts = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    })
    const of = (s: RecipientStatus): number => counts.find((c) => c.status === s)?._count._all ?? 0

    await prisma.campaign.updateMany({
      where: { id, status: { in: [CampaignStatus.QUEUED, CampaignStatus.SENDING] } },
      data: {
        status: remaining === 0 ? CampaignStatus.SENT : CampaignStatus.SENDING,
        sentCount: of(RecipientStatus.SENT),
        failedCount: of(RecipientStatus.FAILED),
        skippedCount: of(RecipientStatus.SKIPPED),
        ...(remaining === 0 ? { finishedAt: now } : {}),
      },
    })
  }
}

export async function runCampaignJob(now: Date): Promise<CampaignRunSummary> {
  const startedAt = Date.now()
  const summary: CampaignRunSummary = {
    campaigns: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    retry: 0,
    durationMs: 0,
  }

  // 送信設定が欠けている状態で走らせると、法定表示の無いメールを送ってしまう
  assertSenderConfigured()

  const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MINUTES * 60_000)
  const rows = await claimRecipients(now, leaseUntil, env.mailBatchSize)
  summary.claimed = rows.length
  if (rows.length === 0) {
    // 送信対象は無いが、直前の実行で送り切った配信を SENT に落とす必要がある
    const running = await prisma.campaign.findMany({
      where: { status: { in: [CampaignStatus.QUEUED, CampaignStatus.SENDING] }, channel: CampaignChannel.EMAIL },
      select: { id: true },
    })
    await finalizeCampaigns(running.map((c) => c.id), now)
    summary.campaigns = running.length
    summary.durationMs = Date.now() - startedAt
    return summary
  }

  const campaignIds = [...new Set(rows.map((r) => r.campaignId))]
  summary.campaigns = campaignIds.length

  // 実際に送り始める前に SENDING にしておく（管理画面で状態が見えるように）
  await prisma.campaign.updateMany({
    where: { id: { in: campaignIds }, status: CampaignStatus.QUEUED },
    data: { status: CampaignStatus.SENDING, startedAt: now },
  })

  const contexts = new Map<string, CampaignContext>()
  for (const id of campaignIds) {
    const ctx = await loadCampaignContext(id)
    if (ctx) contexts.set(id, ctx)
  }

  const transport = getMailTransport()
  const tally = await sendWithConcurrency(rows, contexts, transport, now, env.mailConcurrency)
  summary.sent = tally.sent
  summary.failed = tally.failed
  summary.skipped = tally.skipped
  summary.retry = tally.retry

  await finalizeCampaigns(campaignIds, now)

  summary.durationMs = Date.now() - startedAt
  console.info('[campaign] run finished', summary)
  return summary
}
