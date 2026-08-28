/**
 * 配信先の取り込みと、配信停止（suppression）の管理。
 *
 * 最重要の不変条件：
 *   **一度でも配信停止・バウンスした宛先は、CSVを再取込しても復活しない。**
 * 取り込み時に suppressions を必ず引き、該当する行は同意状態を UNSUBSCRIBED に固定する。
 */
import { CampaignChannel, ConsentStatus, ContactSource, Prisma, SuppressionReason } from '@prisma/client'

import type { ParsedContactRow } from '@/lib/domain/csv'
import { normalizeEmail, normalizePhone } from '@/lib/email/address'
import { prisma } from '@/lib/prisma'

export interface ImportOptions {
  /** 取得経路。フォーム由来なら LINE_FORM を選ぶ */
  source: ContactSource
  /** 同意の根拠を残す説明文。例:「Instagram広告→公式LINE→物件希望フォーム」 */
  consentNote: string | null
  /**
   * CSV に同意列が無い場合の既定値。
   * 既定は UNKNOWN。「全部同意扱い」にできてしまうと法令違反の温床になるため、
   * OPTED_IN を選ぶには管理画面で明示的にチェックさせる。
   */
  defaultConsent: ConsentStatus
}

export interface ImportSummary {
  created: number
  updated: number
  /** 配信停止済みのため同意状態を復活させなかった件数 */
  suppressed: number
  skipped: number
}

/** 一度に処理する件数。3,000件規模でもタイムアウトしないよう分割する */
const CHUNK = 200

export async function importContacts(rows: ParsedContactRow[], options: ImportOptions): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, suppressed: 0, skipped: 0 }
  if (rows.length === 0) return summary

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const emails = chunk.map((r) => r.email)

    const [existing, suppressed] = await Promise.all([
      prisma.contact.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } }),
      prisma.suppression.findMany({
        where: { address: { in: emails }, channel: CampaignChannel.EMAIL },
        select: { address: true },
      }),
    ])
    const existingByEmail = new Map(existing.map((c) => [c.email, c.id]))
    const blocked = new Set(suppressed.map((s) => s.address))

    for (const row of chunk) {
      const isBlocked = blocked.has(row.email)
      const consent = isBlocked
        ? ConsentStatus.UNSUBSCRIBED
        : row.consent === ConsentStatus.UNKNOWN
          ? options.defaultConsent
          : row.consent
      if (isBlocked) summary.suppressed++

      // 配信停止として取り込まれた行は、停止台帳にも載せて以後の全配信から外す
      if (consent === ConsentStatus.UNSUBSCRIBED && !isBlocked) {
        await addSuppression(row.email, SuppressionReason.UNSUBSCRIBED, 'CSV取込時に配信停止として指定')
      }

      const common = {
        name: row.name,
        kana: row.kana,
        phone: normalizePhone(row.phone) ?? row.phone,
        areas: row.areas,
        budgetMin: row.budgetMin,
        budgetMax: row.budgetMax,
        propertyTypes: row.propertyTypes,
        consentNote: row.note ?? options.consentNote,
      } satisfies Prisma.ContactUpdateInput

      try {
        if (existingByEmail.has(row.email)) {
          await prisma.contact.update({
            where: { email: row.email },
            data: {
              // 既存の名前・希望条件を、CSVの空欄で消してしまわないようにする
              ...stripNulls(common),
              // 停止済みを同意済みへ戻すことは絶対にしない
              ...(consent === ConsentStatus.UNSUBSCRIBED
                ? { consent, unsubscribedAt: new Date() }
                : { consent: upgradeConsentOnly(consent) }),
              ...(row.consentAt ? { consentAt: row.consentAt } : {}),
            },
          })
          summary.updated++
        } else {
          await prisma.contact.create({
            data: {
              email: row.email,
              source: options.source,
              consent,
              consentAt: row.consentAt ?? (consent === ConsentStatus.OPTED_IN ? new Date() : null),
              unsubscribedAt: consent === ConsentStatus.UNSUBSCRIBED ? new Date() : null,
              ...common,
              consentNote: row.note ?? options.consentNote,
            },
          })
          summary.created++
        }
      } catch (e) {
        console.error('[contacts] import row failed', { line: row.line, error: (e as Error).message })
        summary.skipped++
      }
    }
  }

  await linkContactsToCustomers()
  return summary
}

/** null/空文字のフィールドを落として、既存値を消さないようにする */
function stripNulls<T extends Record<string, unknown>>(data: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out as Partial<T>
}

/**
 * 同意状態は「上げる」方向にだけ更新する。
 * UNSUBSCRIBED → OPTED_IN の巻き戻しはこの関数を通しても起きない
 * （呼び出し側で UNSUBSCRIBED は別分岐にしてある）。
 */
function upgradeConsentOnly(consent: ConsentStatus): Prisma.ContactUpdateInput['consent'] {
  return consent === ConsentStatus.OPTED_IN ? ConsentStatus.OPTED_IN : undefined
}

/**
 * メールアドレスから公式LINEの顧客を推定して紐づける…ことはできないので、
 * ここでは「LINEに居ない連絡先」を洗い出すためのフックだけ用意しておく。
 * 実際の紐づけは、フォーム側で LINE userId を持って取り込む経路で行う。
 */
async function linkContactsToCustomers(): Promise<void> {
  // 現状は何もしない。将来 LIFF / Lステップ連携で userId が取れたときにここで結ぶ。
}

/** 配信停止台帳への登録。既に載っていれば何もしない */
export async function addSuppression(
  address: string,
  reason: SuppressionReason,
  note?: string,
  channel: CampaignChannel = CampaignChannel.EMAIL,
): Promise<void> {
  const normalized = channel === CampaignChannel.EMAIL ? normalizeEmail(address) : normalizePhone(address)
  if (!normalized) return
  await prisma.suppression.upsert({
    where: { address: normalized },
    create: { address: normalized, channel, reason, note },
    update: {},
  })
}

/**
 * 配信停止を適用する。停止台帳と Contact の両方を更新する。
 * 何度呼んでも同じ結果になる（配信停止リンクは複数回踏まれる）。
 */
export async function unsubscribeContact(contactId: string, note?: string): Promise<{ email: string } | null> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { email: true } })
  if (!contact) return null

  await addSuppression(contact.email, SuppressionReason.UNSUBSCRIBED, note)
  await prisma.contact.update({
    where: { id: contactId },
    data: { consent: ConsentStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
  })
  return contact
}

/**
 * バウンス・苦情の理由。
 * Prisma の enum は const オブジェクトとして生成されるため、
 * `SuppressionReason.BOUNCED` を型として書くことはできない。
 */
export type BounceReason = Extract<SuppressionReason, 'BOUNCED' | 'COMPLAINED'>

/** バウンス・苦情の記録。ハードバウンスは即座に停止台帳へ載せる */
export async function recordBounce(address: string, reason: BounceReason, note?: string): Promise<void> {
  const email = normalizeEmail(address)
  if (!email) return

  await addSuppression(email, reason, note)
  await prisma.contact.updateMany({
    where: { email },
    data: {
      consent: ConsentStatus.UNSUBSCRIBED,
      unsubscribedAt: new Date(),
      bounceCount: { increment: 1 },
      lastBouncedAt: new Date(),
    },
  })
}
