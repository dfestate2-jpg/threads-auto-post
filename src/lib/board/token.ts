/**
 * LINE の通知ボタンから開くリンクに付ける、署名付きの合言葉。
 *
 * なぜリンク（URI）方式なのか：
 * LINE のボタンには postback という方式もあるが、その受け口は稼働中の
 * リマインドシステムの中にある。**そこには一切触れない**と決めたため、
 * ボタンはブラウザを開くリンクにしてある。開く先はこのシステムの中なので、
 * リマインド側のコードを1行も変えずにボタンが機能する。
 *
 * リンクはLINEのトーク履歴に残り、転送もできてしまう。そのため
 * 「誰でも開けるURL」ではなく、鍵で署名し、期限を切ってある。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/** 形式を変えたときに古いリンクを無効化するための版番号 */
const VERSION = 'b1'

/** リンクの有効期間。通知は毎日出るので、長く生かしておく理由がない */
const TTL_MS = 14 * 86_400_000

export type BoardActionKind = 'called' | 'noanswer' | 'end'

const KIND_CODE: Record<BoardActionKind, string> = { called: 'c', noanswer: 'n', end: 'e' }
const CODE_KIND: Record<string, BoardActionKind> = { c: 'called', n: 'noanswer', e: 'end' }

export interface BoardAction {
  kind: BoardActionKind
  entryId: string
  /** 発行時刻（ミリ秒）。期限切れの判定に使う */
  issuedAt: number
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * 署名の鍵。
 *
 * 既存の鍵をそのまま使うと、リマインド側のボタン用データと署名が混ざりうる。
 * 用途名を混ぜて別の鍵を導き出しておけば、一方の合言葉をもう一方に持ち込む
 * 細工が成立しない。鍵の管理は増やさずに、経路だけ分けられる。
 */
function secretOf(): string {
  return createHmac('sha256', env.quickActionSecret).update('board-action').digest('base64url')
}

/** ボタン1つぶんの合言葉を作る */
export function buildBoardToken(action: Omit<BoardAction, 'issuedAt'>, now = new Date()): string | null {
  const code = KIND_CODE[action.kind]
  if (!code) return null
  // 区切り文字が混ざったIDは復元できないので弾く（cuid には含まれない）
  if (!action.entryId || action.entryId.includes('.')) return null

  const body = `${VERSION}.${code}.${action.entryId}.${now.getTime()}`
  return `${body}.${sign(body, secretOf())}`
}

/**
 * 合言葉を読み解く。
 *
 * 署名が違う・期限切れ・形式が違う場合はすべて null。
 * 「なぜ駄目だったか」を呼び出し側へ返さないのは、総当たりの手掛かりを
 * 与えないため。画面には一律で「リンクの期限が切れています」と出す。
 */
export function parseBoardToken(token: string | null | undefined, now = new Date()): BoardAction | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 5) return null

  const [version, code, entryId, issuedRaw, signature] = parts
  if (version !== VERSION || !code || !entryId || !issuedRaw || !signature) return null

  const kind = CODE_KIND[code]
  if (!kind) return null

  const issuedAt = Number(issuedRaw)
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null

  const body = `${version}.${code}.${entryId}.${issuedRaw}`
  if (!safeEqual(signature, sign(body, secretOf()))) return null

  // 未来の日付が入っていたら改竄か時計のずれ。どちらにせよ受け付けない
  const age = now.getTime() - issuedAt
  if (age < -60_000 || age > TTL_MS) return null

  return { kind, entryId, issuedAt }
}
