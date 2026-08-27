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
  // --- 銀行入金 → スプレッドシート自動反映 -----------------------------------
  // 銀行のログイン情報は一切持たない。freee 会計に取り込まれた口座明細を読むだけ。
  get freeeClientId() {
    return required('FREEE_CLIENT_ID')
  },
  get freeeClientSecret() {
    return required('FREEE_CLIENT_SECRET')
  },
  /** 初回投入用のリフレッシュトークン。以降の値はDBが持つ（ローテーションするため） */
  get freeeRefreshTokenSeed() {
    return optional('FREEE_REFRESH_TOKEN')
  },
  get freeeCompanyId() {
    const raw = required('FREEE_COMPANY_ID')
    const value = Number(raw)
    if (!Number.isInteger(value)) throw new Error('FREEE_COMPANY_ID は数値で指定してください')
    return value
  },
  /** 対象の銀行口座ID（カンマ区切り）。未設定なら事業所の全銀行口座が対象 */
  get freeeWalletableIds(): number[] {
    const raw = optional('FREEE_WALLETABLE_IDS')
    if (!raw) return []
    return raw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v))
  },

  get googleServiceAccountEmail() {
    return required('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  },
  get googlePrivateKey() {
    return required('GOOGLE_PRIVATE_KEY')
  },
  get depositSpreadsheetId() {
    return required('DEPOSIT_SPREADSHEET_ID')
  },
  /** 月次シートを新規作成するときの複製元。既存ブックの「コピー」シート */
  get depositTemplateSheetTitle() {
    return optional('DEPOSIT_TEMPLATE_SHEET_TITLE') ?? 'コピー'
  },
  /** 月次シート（yyyyMM）ではなく固定シートに書きたい場合に指定する */
  get depositFixedSheetTitle() {
    return optional('DEPOSIT_SHEET_TITLE')
  },
  /**
   * この日付より前の入金は取り込まない（yyyy-MM-dd）。
   * **導入時に手入力済みの行と重複させないための唯一の砦**なので必須にしている。
   */
  get depositSyncStartDate() {
    const raw = required('DEPOSIT_SYNC_START_DATE')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error('DEPOSIT_SYNC_START_DATE は yyyy-MM-dd 形式で指定してください')
    }
    return raw
  },
  /** 毎回さかのぼって確認する日数。銀行の反映遅れ・訂正を拾うための余白 */
  get depositLookbackDays() {
    const value = Number(optional('DEPOSIT_LOOKBACK_DAYS') ?? '14')
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 14
  },
  /** これ未満の入金は記録しない（利息の数円などを弾く） */
  get depositMinAmount() {
    const value = Number(optional('DEPOSIT_MIN_AMOUNT') ?? '1')
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1
  },
  get depositTimezone() {
    return optional('DEPOSIT_TIMEZONE') ?? 'Asia/Tokyo'
  },
  /** 法人格の略号の扱い: strip（既定・"カ)タマホーム"→"タマホーム"）/ expand / keep */
  get depositCorporateMode(): 'strip' | 'expand' | 'keep' {
    const raw = optional('DEPOSIT_CORPORATE_MODE')
    return raw === 'expand' || raw === 'keep' ? raw : 'strip'
  },
  /** 同じ入金日が続くとき2行目以降の日付を空欄にする（既存の手入力に合わせる） */
  get depositOmitRepeatedDate() {
    return (optional('DEPOSIT_OMIT_REPEATED_DATE') ?? '1') !== '0'
  },
  /** 1回の実行で追記する最大行数（暴走時の被害を限定する） */
  get depositMaxRowsPerRun() {
    const value = Number(optional('DEPOSIT_MAX_ROWS_PER_RUN') ?? '200')
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 200
  },
  /** 0 を指定すると同期を止める（障害時の緊急停止用） */
  get depositSyncEnabled() {
    return (optional('DEPOSIT_SYNC_ENABLED') ?? '1') !== '0'
  },

  get isProduction() {
    return process.env.NODE_ENV === 'production'
  },
}
