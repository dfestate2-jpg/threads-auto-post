/**
 * Incoming Webhook の宛先サービスごとにペイロード形式を切り替える。
 *
 * Slack        : { "text": "..." }
 * Discord      : { "content": "..." }
 * LINE WORKS   : { "content": { "type": "text", "text": "..." } }
 *
 * 判定は URL のホストで行う。判別できない場合は Slack 互換の { text } を送る
 * （Google Chat・Mattermost・Rocket.Chat など多くのサービスが同形式を受理するため）。
 */
export type WebhookFlavor = 'SLACK' | 'DISCORD' | 'LINE_WORKS'

export function detectWebhookFlavor(url: string): WebhookFlavor {
  let host = ''
  try {
    host = new URL(url).host.toLowerCase()
  } catch {
    return 'SLACK'
  }
  if (host.endsWith('discord.com') || host.endsWith('discordapp.com')) return 'DISCORD'
  if (host.endsWith('worksmobile.com') || host.endsWith('works.do')) return 'LINE_WORKS'
  return 'SLACK'
}

/** Slack は 40,000 文字が上限。他サービスに合わせて余裕を持って切る */
const MAX_LENGTH = 3800

export function buildWebhookPayload(url: string, text: string): Record<string, unknown> {
  const body = text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text
  switch (detectWebhookFlavor(url)) {
    case 'DISCORD':
      return { content: body }
    case 'LINE_WORKS':
      return { content: { type: 'text', text: body } }
    default:
      return { text: body }
  }
}
