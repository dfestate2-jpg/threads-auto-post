/**
 * 社内LINE通知に付ける「ワンタップ操作」の署名付きペイロード。
 *
 * LINE の postback データはクライアント（LINEアプリ）を経由して戻ってくるため、
 * **中身を信用してはいけない**。ここで HMAC を付け、受信側で必ず検証する。
 *
 * さらに `cycleId`（その未返信サイクルの起点 = firstUnrepliedAt のエポックミリ秒）を
 * 埋め込むことで、**古い通知のボタンを押しても新しい未返信案件は閉じられない**。
 * これが無いと「昨日の通知をスクロールして押したら、今朝の未返信が消える」という
 * 最悪の見逃しが起きる。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** LINE の postback data は 300 文字まで */
const MAX_DATA_LENGTH = 300
const VERSION = 'v1'
const KIND_RESOLVE = 'R'
const KIND_ASSIGN = 'A'

const KIND_BY_CODE: Record<string, QuickActionKind> = {
  [KIND_RESOLVE]: 'RESOLVE',
  [KIND_ASSIGN]: 'ASSIGN',
}

/** RESOLVE = 対応済みにする / ASSIGN = 押した人を担当者にする */
export type QuickActionKind = 'RESOLVE' | 'ASSIGN'

export interface QuickAction {
  kind: QuickActionKind
  customerId: string
  /** 未返信サイクルの識別子（firstUnrepliedAt.getTime()） */
  cycleId: number
}

/** @deprecated 名前が実態に合わなくなったため QuickAction を使う */
export type ResolveQuickAction = QuickAction

function signature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * ボタン用のデータを組み立てる。
 * 300文字を超える場合は null を返し、呼び出し側はボタン無しで通知する
 * （ボタンが出せないことより、通知が飛ばないことのほうが重大なため）。
 */
function build(kindCode: string, action: Omit<QuickAction, 'kind'>, secret: string): string | null {
  if (!action.customerId || action.customerId.includes('.')) return null
  if (!Number.isFinite(action.cycleId)) return null
  const body = `${VERSION}.${kindCode}.${action.customerId}.${Math.trunc(action.cycleId)}`
  const data = `${body}.${signature(body, secret)}`
  return data.length <= MAX_DATA_LENGTH ? data : null
}

/** 「対応済みにする」ボタン用 */
export function buildResolveActionData(action: Omit<QuickAction, 'kind'>, secret: string): string | null {
  return build(KIND_RESOLVE, action, secret)
}

/** 「自分が担当にする」ボタン用 */
export function buildAssignActionData(action: Omit<QuickAction, 'kind'>, secret: string): string | null {
  return build(KIND_ASSIGN, action, secret)
}

/**
 * postback データを検証して復元する。
 * 署名不一致・形式不正・未知バージョンはすべて null（＝何もしない）。
 */
export function parseQuickActionData(data: string | null | undefined, secret: string): QuickAction | null {
  if (!data || data.length > MAX_DATA_LENGTH) return null
  const parts = data.split('.')
  if (parts.length !== 5) return null
  const [version, kindCode, customerId, cycleRaw, sig] = parts
  if (version !== VERSION || !kindCode) return null
  const kind = KIND_BY_CODE[kindCode]
  if (!kind) return null
  if (!customerId || !cycleRaw || !sig) return null

  const body = `${version}.${kindCode}.${customerId}.${cycleRaw}`
  if (!safeEqual(sig, signature(body, secret))) return null

  const cycleId = Number(cycleRaw)
  if (!Number.isFinite(cycleId)) return null

  return { kind, customerId, cycleId }
}
