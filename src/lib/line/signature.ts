import crypto from 'node:crypto'

/**
 * LINE Webhook の署名検証。
 *
 * 重要: 必ず **生のリクエストボディ（バイト列そのもの）** に対して計算すること。
 * JSON.parse → JSON.stringify した文字列では署名が一致しない。
 */
export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature) return false
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest('base64')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** 定数時間での文字列比較（Cron / Ingest シークレットの照合に使う） */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}
