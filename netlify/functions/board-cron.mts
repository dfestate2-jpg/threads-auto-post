import type { Config } from '@netlify/functions'

/**
 * 追客ボードの定期実行。
 *
 * 未返信リマインド（reminders-cron・5分おき）とは完全に別枠で、
 * 互いに影響しない。こちらは1時間おきに動き、設定した時刻（既定は朝9時）を
 * 過ぎた追客だけを担当者のLINEへ送る。
 *
 * 期限を過ぎたぶんもまとめて拾うので、起動が飛んでも追客漏れにはならない。
 */
export default async (): Promise<Response> => {
  const base = process.env.APP_BASE_URL ?? process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.error('APP_BASE_URL / CRON_SECRET が未設定です')
    return new Response('misconfigured', { status: 500 })
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/api/cron/board`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  })
  const body = await res.text()
  console.log('[board-cron]', res.status, body.slice(0, 500))
  return new Response(body, { status: res.status })
}

export const config: Config = { schedule: '0 * * * *' }
