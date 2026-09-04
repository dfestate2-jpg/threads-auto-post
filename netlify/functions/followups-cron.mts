import type { Config } from '@netlify/functions'

/**
 * Netlify Scheduled Function（追客）。
 *
 * 未返信リマインド（5分ごと）とは目的が違い、こちらは「日単位の追客」を回す。
 * 毎正時に実行し、期限が来た自動遷移・営業への通知・優先度の引き直しを行う。
 * 認証は X-Cron-Secret（環境変数 CRON_SECRET）。
 */
export default async (): Promise<Response> => {
  const base = process.env.APP_BASE_URL ?? process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.error('APP_BASE_URL / CRON_SECRET が未設定です')
    return new Response('misconfigured', { status: 500 })
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/api/cron/followups`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  })
  const body = await res.text()
  console.log('[followups-cron]', res.status, body.slice(0, 500))
  return new Response(body, { status: res.status })
}

export const config: Config = { schedule: '0 * * * *' }
