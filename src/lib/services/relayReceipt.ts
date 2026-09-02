import { prisma } from '@/lib/prisma'

/**
 * 受け口ごとの保持件数。
 *
 * **全体で一律に間引いてはいけない。** 定期実行は5分ごと（1日288件）記録されるため、
 * 全体で200件に絞ると1日たたずに顧客メッセージの記録が押し出されて消える。
 * 顧客メッセージが届いているかどうかは、この仕組みで一番見たいものなので、
 * 受け口ごとに独立して残す。
 */
const KEEP_PER_ENDPOINT = 100

export const RELAY_ENDPOINTS = ['RELAY', 'WEBHOOK', 'CRON'] as const

export type RelayEndpoint = (typeof RELAY_ENDPOINTS)[number]

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
    await pruneRelayReceipts(input.endpoint)
  } catch (e) {
    console.warn('[relay-receipt] 記録に失敗しました', { message: (e as Error).message })
  }
}

/** その受け口の直近 KEEP_PER_ENDPOINT 件だけ残す */
async function pruneRelayReceipts(endpoint: RelayEndpoint): Promise<void> {
  const cutoff = await prisma.relayReceipt.findMany({
    where: { endpoint },
    orderBy: { receivedAt: 'desc' },
    skip: KEEP_PER_ENDPOINT,
    take: 1,
    select: { receivedAt: true },
  })
  const oldest = cutoff[0]
  if (!oldest) return
  await prisma.relayReceipt.deleteMany({
    where: { endpoint, receivedAt: { lte: oldest.receivedAt } },
  })
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

/**
 * 受け口ごとに直近 perEndpoint 件ずつ取って、時刻順に並べ直す。
 *
 * 単純に「全体の直近N件」を出すと、頻度の高い定期実行だけで画面が埋まり、
 * 数時間に1件しか来ない顧客メッセージの記録が見えなくなる。
 * 頻度の違う受け口を1つの表で比べられるようにするのがここの役目。
 */
export async function listRecentRelayReceipts(perEndpoint = 8): Promise<RelayReceiptRow[]> {
  const perEndpointRows = await Promise.all(
    RELAY_ENDPOINTS.map((endpoint) =>
      prisma.relayReceipt.findMany({
        where: { endpoint },
        orderBy: { receivedAt: 'desc' },
        take: perEndpoint,
      }),
    ),
  )
  return perEndpointRows
    .flat()
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
}
