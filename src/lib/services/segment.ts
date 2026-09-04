/**
 * 配信対象の抽出条件。
 *
 * 「公式LINEの一斉配信で反応が無かった層をメールで追う」ための条件をここに集約する。
 * 抽出条件は SQL に落ちる前にこの一箇所を通るので、
 * 「配信停止した人が対象に混ざる」経路を作らないことをここで担保できる。
 */
import { ConsentStatus, Direction, Prisma, type PropertyType } from '@prisma/client'

export interface SegmentInput {
  areas: string[]
  budgetMin: number | null
  budgetMax: number | null
  types: PropertyType[]
  /** 明示的な同意がある人にだけ送る */
  optedInOnly: boolean
  /** 公式LINEで反応が無い人だけに送る */
  lineSilentOnly: boolean
  /** 「反応が無い」とみなす日数 */
  lineSilentDays: number
}

export const DEFAULT_SEGMENT: SegmentInput = {
  areas: [],
  budgetMin: null,
  budgetMax: null,
  types: [],
  optedInOnly: true,
  lineSilentOnly: false,
  lineSilentDays: 30,
}

/**
 * 抽出条件を Prisma の where 句にする。
 *
 * 常に効く土台（どの条件でも外れない）:
 *   - active
 *   - consent が UNSUBSCRIBED でない
 *   - unsubscribedAt が null
 * 実際の送信直前には suppressions テーブルも引き直す（二重の防波堤）。
 */
export function buildContactWhere(seg: SegmentInput, now: Date): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [
    { active: true },
    { consent: { not: ConsentStatus.UNSUBSCRIBED } },
    { unsubscribedAt: null },
  ]

  if (seg.optedInOnly) and.push({ consent: ConsentStatus.OPTED_IN })

  if (seg.areas.length > 0) and.push({ areas: { hasSome: seg.areas } })
  if (seg.types.length > 0) and.push({ propertyTypes: { hasSome: seg.types } })

  // 予算は「希望レンジ」と「配信する価格帯」が重なるかで判定する。
  // 予算未登録の人は除外しない（未入力を理由に取りこぼさないため）。
  if (seg.budgetMin != null) {
    and.push({ OR: [{ budgetMax: null }, { budgetMax: { gte: seg.budgetMin } }] })
  }
  if (seg.budgetMax != null) {
    and.push({ OR: [{ budgetMin: null }, { budgetMin: { lte: seg.budgetMax } }] })
  }

  if (seg.lineSilentOnly) {
    const since = new Date(now.getTime() - Math.max(1, seg.lineSilentDays) * 24 * 60 * 60 * 1000)
    and.push({
      OR: [
        // そもそも公式LINEに居ない（＝LINEでは届けられない）
        { customerId: null },
        // ブロック済み
        { customer: { blocked: true } },
        // 直近この期間、顧客からの発信が一度も無い
        { customer: { messages: { none: { direction: Direction.INBOUND, sentAt: { gte: since } } } } },
      ],
    })
  }

  return { AND: and }
}

/** 管理画面に出す条件の要約 */
export function describeSegment(seg: SegmentInput): string[] {
  const out: string[] = []
  out.push(seg.optedInOnly ? '配信同意あり（OPTED_IN）のみ' : '配信停止していない全員')
  if (seg.lineSilentOnly) out.push(`公式LINEで${seg.lineSilentDays}日以上反応が無い人のみ`)
  if (seg.areas.length > 0) out.push(`希望エリア: ${seg.areas.join(' / ')}`)
  if (seg.types.length > 0) out.push(`希望種別: ${seg.types.length}件を指定`)
  if (seg.budgetMin != null || seg.budgetMax != null) {
    const lo = seg.budgetMin != null ? `${seg.budgetMin.toLocaleString('ja-JP')}万円` : '下限なし'
    const hi = seg.budgetMax != null ? `${seg.budgetMax.toLocaleString('ja-JP')}万円` : '上限なし'
    out.push(`価格帯: ${lo} 〜 ${hi}`)
  }
  return out
}
