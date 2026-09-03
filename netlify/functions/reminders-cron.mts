import type { Config } from '@netlify/functions'

/**
 * Netlify Scheduled Function。
 * 5分ごとに内部の Cron エンドポイントを叩く。
 * 認証は X-Cron-Secret（環境変数 CRON_SECRET）で行う。
 */
export default async (): Promise<Response> => {
  const base = process.env.APP_BASE_URL ?? process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.error('APP_BASE_URL / CRON_SECRET が未設定です')
    return new Response('misconfigured', { status: 500 })
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/api/cron/reminders`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  })
  const body = await res.text()
  console.log('[reminders-cron]', res.status, body.slice(0, 500))
  return new Response(body, { status: res.status })
}

export const config: Config = { schedule: '*/5 * * * *' }
