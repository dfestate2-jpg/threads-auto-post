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
  /** 未設定でも例外にしない版。プロフィール取得のように「取れなくても運用が止まらない」用途で使う */
  get optionalLineChannelAccessToken() {
    return optional('LINE_CHANNEL_ACCESS_TOKEN')
  },
  /**
   * 顧客対応チャネルのチャネルID。
   * アクセストークンが手元に無い場合に、チャネルID＋シークレットから
   * **使い捨ての**トークンを発行するために使う（src/lib/line/statelessToken.ts）。
   */
  get optionalLineChannelId() {
    return optional('LINE_CHANNEL_ID')
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
  /**
   * 未設定でも例外にしない版。
   * 定期実行の受け口で使う。未設定というだけで 500 になると
   * 「設定漏れ」と「認証失敗」が外から区別できず、原因追跡が止まる。
   */
  get optionalCronSecret() {
    return optional('CRON_SECRET')
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

  // --- 物件情報の一斉メール配信 -------------------------------------------
  /** 送信プロバイダ。'resend' | 'sendgrid'。未設定なら送信を行わない（DRY RUN） */
  get mailProvider() {
    return (optional('MAIL_PROVIDER') ?? '').toLowerCase()
  },
  get mailApiKey() {
    return required('MAIL_API_KEY')
  },
  /** 差出人アドレス。SPF/DKIM を設定済みの自社ドメインであること */
  get mailFromAddress() {
    return required('MAIL_FROM_ADDRESS')
  },
  get mailFromName() {
    return optional('MAIL_FROM_NAME') ?? ''
  },
  get mailReplyTo() {
    return optional('MAIL_REPLY_TO')
  },
  /**
   * 特定電子メール法で本文への表示が義務づけられている送信者情報。
   * 未設定だと配信を開始できないようにしている（法令違反の送信を構造的に防ぐ）。
   */
  get mailSenderOrg() {
    return required('MAIL_SENDER_ORG')
  },
  get mailSenderAddress() {
    return required('MAIL_SENDER_ADDRESS')
  },
  get mailSenderTel() {
    return optional('MAIL_SENDER_TEL')
  },
  /** 配信停止リンクの署名鍵。未設定ならセッション鍵を流用する */
  get unsubscribeSecret() {
    return optional('UNSUBSCRIBE_SECRET') ?? required('SESSION_SECRET')
  },
  /** Cron 1回あたりの送信件数。プロバイダのレート上限に合わせて調整する */
  get mailBatchSize() {
    const n = Number(optional('MAIL_BATCH_SIZE') ?? '100')
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 100
  },
  /** 同時送信数。上げすぎるとプロバイダに 429 で弾かれる */
  get mailConcurrency() {
    const n = Number(optional('MAIL_CONCURRENCY') ?? '4')
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 20) : 4
  },
  /** 送信プロバイダからのバウンス通知 Webhook を認証する共有シークレット */
  get mailWebhookSecret() {
    return optional('MAIL_WEBHOOK_SECRET')
  },
  get appBaseUrl() {
    return optional('APP_BASE_URL') ?? ''
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production'
  },
}
