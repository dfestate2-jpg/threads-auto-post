import { prisma } from '@/lib/prisma'

/** 保持件数。診断に使えれば十分で、無制限に貯めても意味がない */
const KEEP = 200

export type RelayEndpoint = 'RELAY' | 'WEBHOOK'

export interface RelayReceiptInput {
  endpoint: RelayEndpoint
  accepted: boolean
  /** 受理経路（LINE_SIGNATURE / RELAY_TOKEN）または拒否理由（BAD_TOKEN 等） */
  detail: string
  eventCount?: number
  /** 届いたJSONの構造だけ。値は含めないこと */
  shape?: string | null
}

/**
 * 受信を記録する。
 *
 * **記録の失敗で受け口を落としてはいけない。** ここで例外を投げると、
 * 診断のための仕組みが原因で本物の顧客メッセージを取りこぼすことになり、
 * 目的と正反対の結果になる。失敗はログに残すだけで飲み込む。
 */
export async function recordRelayReceipt(input: RelayReceiptInput): Promise<void> {
  try {
    await prisma.relayReceipt.create({
      data: {
        endpoint: input.endpoint,
        accepted: input.accepted,
        detail: input.detail,
        eventCount: input.eventCount ?? 0,
        shape: input.shape ?? null,
      },
    })
    await pruneRelayReceipts()
  } catch (e) {
    console.warn('[relay-receipt] 記録に失敗しました', { message: (e as Error).message })
  }
}

/** 直近 KEEP 件だけ残す */
async function pruneRelayReceipts(): Promise<void> {
  const cutoff = await prisma.relayReceipt.findMany({
    orderBy: { receivedAt: 'desc' },
    skip: KEEP,
    take: 1,
    select: { receivedAt: true },
  })
  const oldest = cutoff[0]
  if (!oldest) return
  await prisma.relayReceipt.deleteMany({ where: { receivedAt: { lte: oldest.receivedAt } } })
}

export interface RelayReceiptRow {
  id: string
  receivedAt: Date
  endpoint: string
  accepted: boolean
  detail: string
  eventCount: number
  shape: string | null
}

export async function listRecentRelayReceipts(take = 20): Promise<RelayReceiptRow[]> {
  return prisma.relayReceipt.findMany({ orderBy: { receivedAt: 'desc' }, take })
}
