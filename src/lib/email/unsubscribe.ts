/**
 * 配信停止リンクの署名付きトークン。
 *
 * 有効期限は設けない。特定電子メール法は「受信者がいつでも配信停止できること」を
 * 求めており、古いメールのリンクが切れているのは法令上も実務上も不可。
 */
import crypto from 'node:crypto'

export interface UnsubscribePayload {
  /** Contact.id */
  c: string
  /** 発端となった配信の Campaign.id（分析用。無くてもよい） */
  k?: string
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url')
}

export function createUnsubscribeToken(payload: UnsubscribePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function parseUnsubscribeToken(token: string | null | undefined, secret: string): UnsubscribePayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = Buffer.from(sign(body, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UnsubscribePayload
    return typeof payload?.c === 'string' && payload.c.length > 0 ? payload : null
  } catch {
    return null
  }
}

export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/unsubscribe?t=${encodeURIComponent(token)}`
}
