/**
 * 環境変数の読み出し。
 * 秘密値は決してログに出さず、未設定は「使う直前」に例外を投げる。
 */

function optional(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim().length > 0 ? v.trim() : undefined
}

export function required(name: string): string {
  const v = optional(name)
  if (!v) throw new Error(`環境変数 ${name} が設定されていません`)
  return v
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL')
  },
  get lineChannelSecret() {
    return required('LINE_CHANNEL_SECRET')
  },
  get lineChannelAccessToken() {
    return required('LINE_CHANNEL_ACCESS_TOKEN')
  },
  /** 社内通知Bot。未設定なら顧客対応チャネルのトークンを流用する */
  get lineNotifyAccessToken() {
    return optional('LINE_NOTIFY_CHANNEL_ACCESS_TOKEN') ?? required('LINE_CHANNEL_ACCESS_TOKEN')
  },
  get internalLineGroupId() {
    return optional('INTERNAL_LINE_GROUP_ID')
  },
  get fallbackWebhookUrl() {
    return optional('FALLBACK_WEBHOOK_URL')
  },
  get cronSecret() {
    return required('CRON_SECRET')
  },
  get sessionSecret() {
    return required('SESSION_SECRET')
  },
  get ingestSecret() {
    return optional('INGEST_SECRET')
  },
  get appBaseUrl() {
    return optional('APP_BASE_URL') ?? ''
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production'
  },
}
