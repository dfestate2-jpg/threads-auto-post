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

/**
 * 署名がどのチャネルのものかを判定する。
 *
 * 鍵は**両方とも省略可能**にしてある。運用構成によっては片方しか設定しない
 * （例：顧客対応チャネルの受信を Lステップの転送に任せる場合、
 * `LINE_CHANNEL_SECRET` は設定しない）ためで、
 * 「未設定の鍵を必須として読む」と受け口全体が 500 になり、
 * 署名を見る前に全リクエストを取りこぼす。
 */
export function resolveChannelBySignature(
  rawBody: string,
  signature: string | null,
  secrets: { main?: string; notify?: string },
): 'MAIN' | 'NOTIFY' | null {
  if (!signature) return null
  if (secrets.main && verifyLineSignature(rawBody, signature, secrets.main)) return 'MAIN'
  if (secrets.notify && verifyLineSignature(rawBody, signature, secrets.notify)) return 'NOTIFY'
  return null
}
