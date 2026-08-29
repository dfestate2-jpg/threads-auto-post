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
  /**
   * 未設定でも例外にしない版。
   * Lステップ経由の転送は転送用トークンでも受理できるため、
   * 顧客対応チャネルのシークレットが未設定というだけで
   * 受け口全体が 500 になることを避ける。
   */
  get optionalLineChannelSecret() {
    return optional('LINE_CHANNEL_SECRET')
  },
  get lineChannelAccessToken() {
    return required('LINE_CHANNEL_ACCESS_TOKEN')
  },
  /** 社内通知Bot。未設定なら顧客対応チャネルのトークンを流用する */
  get lineNotifyAccessToken() {
    return optional('LINE_NOTIFY_CHANNEL_ACCESS_TOKEN') ?? required('LINE_CHANNEL_ACCESS_TOKEN')
  },
  /**
   * 社内通知Botを別チャネルで運用する場合のチャネルシークレット。
   * 「対応済みにする」ボタンの postback はそのチャネルの Webhook に届くため、
   * 署名検証をこちらでも行えるようにする。
   */
  get lineNotifyChannelSecret() {
    return optional('LINE_NOTIFY_CHANNEL_SECRET')
  },
  /** 社内通知の既定チャネル（Slack Incoming Webhook）。Slack 運用時はこちらを使う */
  get internalSlackWebhookUrl() {
    return optional('INTERNAL_SLACK_WEBHOOK_URL')
  },
  /** 社内通知を LINE グループで行う場合の宛先 */
  get internalLineGroupId() {
    return optional('INTERNAL_LINE_GROUP_ID')
  },
  /**
   * Lステップの「Webhook転送」の受け口で使う共有トークン。
   * 転送時に x-line-signature が付いてこない場合の認証経路。
   * 未設定なら、署名が検証できる転送しか受け付けない。
   */
  get lstepRelayToken() {
    return optional('LSTEP_RELAY_TOKEN')
  },
  /** 導入直後の疎通確認用。転送されたリクエストの「形」だけをログに出す（値は出さない） */
  get lstepRelayDebug() {
    return optional('LSTEP_RELAY_DEBUG') === '1'
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
  /**
   * 社内LINE通知のワンタップ操作（postback）に付ける署名の鍵。
   * 未設定ならセッション鍵を流用する。鍵を変えると発行済みボタンは無効になる。
   */
  get quickActionSecret() {
    return optional('QUICK_ACTION_SECRET') ?? required('SESSION_SECRET')
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
