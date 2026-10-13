/**
 * 配信の準備：セグメントの評価と、送信キューの作成。
 *
 * 「対象を確定する」瞬間をはっきり分けているのが要点。
 * 確定した時点で CampaignRecipient として1件ずつ行を作るので、
 *   - 送信中に Contact が増減しても対象はぶれない
 *   - どこまで送ったかが行単位で残る（途中で落ちても再開できる）
 *   - (campaignId, contactId) の UNIQUE で二重送信が構造的に起きない
 */
import { CampaignChannel, CampaignStatus, Prisma, type Campaign } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { buildContactWhere, type SegmentInput } from './segment'

/** キュー作成時の1回あたりの挿入件数 */
const INSERT_CHUNK = 500

export function segmentOf(campaign: Campaign): SegmentInput {
  return {
    areas: campaign.segAreas,
    budgetMin: campaign.segBudgetMin,
    budgetMax: campaign.segBudgetMax,
    types: campaign.segTypes,
    optedInOnly: campaign.segOptedInOnly,
    lineSilentOnly: campaign.segLineSilentOnly,
    lineSilentDays: campaign.segLineSilentDays,
  }
}

/** 送信せずに対象件数だけ数える（管理画面のプレビュー用） */
export async function countSegment(seg: SegmentInput, now: Date): Promise<number> {
  return prisma.contact.count({ where: buildContactWhere(seg, now) })
}

export interface PreviewResult {
  total: number
  sample: { id: string; email: string; name: string | null }[]
}

export async function previewSegment(seg: SegmentInput, now: Date): Promise<PreviewResult> {
  const where = buildContactWhere(seg, now)
  const [total, sample] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])
  return { total, sample }
}

export type QueueOutcome =
  | { ok: false; reason: string }
  | { ok: true; total: number; suppressed: number }

/**
 * 対象を確定してキューに積む。
 *
 * 停止台帳（suppressions）はここで一度引くが、送信直前にもう一度引き直す。
 * 「対象確定から実際の送信までの間に配信停止された人」に送らないための二段構え。
 */
export async function queueCampaign(campaignId: string, now: Date): Promise<QueueOutcome> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) return { ok: false, reason: '配信が見つかりません' }
  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.PAUSED) {
    return { ok: false, reason: 'この配信は既に開始済みです' }
  }
  if (campaign.subject.trim().length === 0 || campaign.body.trim().length === 0) {
    return { ok: false, reason: '件名と本文を入力してください' }
  }
  if (campaign.channel !== CampaignChannel.EMAIL) {
    return { ok: false, reason: 'メール以外のチャネルはまだ送信できません' }
  }

  const where = buildContactWhere(segmentOf(campaign), now)
  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  if (contacts.length === 0) return { ok: false, reason: '条件に一致する配信先が0件です' }

  // 停止台帳に載っている宛先をここで落とす
  const suppressed = await prisma.suppression.findMany({
    where: { address: { in: contacts.map((c) => c.email) }, channel: CampaignChannel.EMAIL },
    select: { address: true },
  })
  const blocked = new Set(suppressed.map((s) => s.address))
  const targets = contacts.filter((c) => !blocked.has(c.email))
  if (targets.length === 0) return { ok: false, reason: '条件に一致した宛先がすべて配信停止済みです' }

  let inserted = 0
  for (let i = 0; i < targets.length; i += INSERT_CHUNK) {
    const chunk = targets.slice(i, i + INSERT_CHUNK)
    const res = await prisma.campaignRecipient.createMany({
      data: chunk.map((c) => ({
        campaignId,
        contactId: c.id,
        address: c.email,
        name: c.name,
        nextAttemptAt: now,
      })),
      // 再開時に既存の行と衝突しても止まらないようにする
      skipDuplicates: true,
    })
    inserted += res.count
  }

  const total = await prisma.campaignRecipient.count({ where: { campaignId } })
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.QUEUED,
      totalCount: total,
      queuedAt: campaign.queuedAt ?? now,
      lastError: null,
    },
  })

  console.info('[campaign] queued', { campaignId, inserted, total, suppressed: blocked.size })
  return { ok: true, total, suppressed: blocked.size }
}

/** 送信中の配信を止める。既に確保済みの数件は送信されることがある */
export async function pauseCampaign(campaignId: string): Promise<boolean> {
  const res = await prisma.campaign.updateMany({
    where: { id: campaignId, status: { in: [CampaignStatus.QUEUED, CampaignStatus.SENDING] } },
    data: { status: CampaignStatus.PAUSED },
  })
  return res.count > 0
}

/** 一時停止した配信を再開する */
export async function resumeCampaign(campaignId: string): Promise<boolean> {
  const res = await prisma.campaign.updateMany({
    where: { id: campaignId, status: CampaignStatus.PAUSED },
    data: { status: CampaignStatus.QUEUED, lastError: null },
  })
  return res.count > 0
}

export interface CampaignProgress {
  total: number
  pending: number
  sent: number
  failed: number
  skipped: number
}

export async function getCampaignProgress(campaignId: string): Promise<CampaignProgress> {
  const rows = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  })
  const count = (s: string): number => rows.find((r) => r.status === s)?._count._all ?? 0
  return {
    total: rows.reduce((sum, r) => sum + r._count._all, 0),
    pending: count('PENDING'),
    sent: count('SENT'),
    failed: count('FAILED'),
    skipped: count('SKIPPED'),
  }
}

/** 配信に載せる物件を、表示順で取り出す */
export async function loadCampaignProperties(campaignId: string) {
  const rows = await prisma.campaignProperty.findMany({
    where: { campaignId },
    orderBy: { position: 'asc' },
    include: { property: true },
  })
  return rows.map((r) => r.property)
}

export function campaignSelectForList(): Prisma.CampaignSelect {
  return {
    id: true,
    name: true,
    subject: true,
    status: true,
    channel: true,
    totalCount: true,
    sentCount: true,
    failedCount: true,
    skippedCount: true,
    queuedAt: true,
    startedAt: true,
    finishedAt: true,
    createdAt: true,
  }
}
