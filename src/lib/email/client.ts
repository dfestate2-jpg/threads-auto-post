/**
 * メール送信プロバイダのアダプタ。
 *
 * 自前のSMTPは使わない。3,000件規模を自社サーバーから送るとIPレピュテーションを
 * 焼き、業務メールまで届かなくなるため、送信実績のあるプロバイダに委ねる。
 *
 * どのプロバイダでも `List-Unsubscribe` / `List-Unsubscribe-Post` を必ず付ける。
 * Gmail・Yahoo の一括送信者要件（ワンクリック配信停止）を満たすために必須。
 */
import { env } from '@/lib/env'
import { sanitizeHeaderValue } from './address'

export class MailSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** true なら宛先固有の問題。リトライしても無駄なので即 FAILED にする */
    readonly permanent: boolean,
  ) {
    super(message)
    this.name = 'MailSendError'
  }
}

export interface OutgoingMail {
  to: string
  toName?: string | null
  subject: string
  text: string
  html: string
  /** RFC 8058 のワンクリック配信停止を受けるURL */
  unsubscribeUrl: string
}

export interface SendResult {
  /** プロバイダ側のID。バウンス通知との突き合わせに使う */
  messageId: string | null
}

export interface MailTransport {
  readonly name: string
  send(mail: OutgoingMail): Promise<SendResult>
}

const TIMEOUT_MS = 15_000

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    return { status: res.status, text: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 4xx は宛先やリクエストの問題なので恒久的失敗として扱う。
 * ただし 429（レート超過）と 408 は時間を置けば通るのでリトライ対象に残す。
 */
function isPermanent(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429 && status !== 408
}

function fromHeader(): string {
  const name = sanitizeHeaderValue(env.mailFromName)
  return name ? `${name} <${env.mailFromAddress}>` : env.mailFromAddress
}

function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

class ResendTransport implements MailTransport {
  readonly name = 'resend'

  async send(mail: OutgoingMail): Promise<SendResult> {
    const { status, text } = await post(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${env.mailApiKey}` },
      {
        from: fromHeader(),
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(env.mailReplyTo ? { reply_to: env.mailReplyTo } : {}),
        headers: listUnsubscribeHeaders(mail.unsubscribeUrl),
      },
    )
    if (status >= 300) {
      throw new MailSendError(`resend send failed (${status}): ${text.slice(0, 300)}`, status, isPermanent(status))
    }
    try {
      return { messageId: (JSON.parse(text) as { id?: string }).id ?? null }
    } catch {
      return { messageId: null }
    }
  }
}

class SendGridTransport implements MailTransport {
  readonly name = 'sendgrid'

  async send(mail: OutgoingMail): Promise<SendResult> {
    const name = sanitizeHeaderValue(env.mailFromName)
    const res = await post(
      'https://api.sendgrid.com/v3/mail/send',
      { Authorization: `Bearer ${env.mailApiKey}` },
      {
        personalizations: [
          { to: [{ email: mail.to, ...(mail.toName ? { name: sanitizeHeaderValue(mail.toName) } : {}) }] },
        ],
        from: { email: env.mailFromAddress, ...(name ? { name } : {}) },
        ...(env.mailReplyTo ? { reply_to: { email: env.mailReplyTo } } : {}),
        subject: mail.subject,
        content: [
          { type: 'text/plain', value: mail.text },
          { type: 'text/html', value: mail.html },
        ],
        headers: listUnsubscribeHeaders(mail.unsubscribeUrl),
        // SendGrid 側の配信停止管理は使わない。停止リストは自前DBを唯一の正とする
        mail_settings: { bypass_list_management: { enable: false } },
      },
    )
    if (res.status >= 300) {
      throw new MailSendError(
        `sendgrid send failed (${res.status}): ${res.text.slice(0, 300)}`,
        res.status,
        isPermanent(res.status),
      )
    }
    return { messageId: null }
  }
}

/**
 * 送信を行わず、内容をログに出すだけのトランスポート。
 * MAIL_PROVIDER 未設定時の既定。本番の鍵を入れる前に配信フロー全体を通して確認できる。
 */
class DryRunTransport implements MailTransport {
  readonly name = 'dry-run'

  async send(mail: OutgoingMail): Promise<SendResult> {
    console.warn('[mail] DRY RUN（MAIL_PROVIDER 未設定のため実送信していません）', {
      to: mail.to,
      subject: mail.subject,
      bytes: mail.text.length,
    })
    return { messageId: null }
  }
}

export function getMailTransport(): MailTransport {
  switch (env.mailProvider) {
    case 'resend':
      return new ResendTransport()
    case 'sendgrid':
      return new SendGridTransport()
    case '':
      return new DryRunTransport()
    default:
      throw new Error(`MAIL_PROVIDER の値が不正です: ${env.mailProvider}（resend / sendgrid のいずれか）`)
  }
}

/** 実際にメールが飛ぶ設定になっているか（管理画面の警告表示に使う） */
export function isMailConfigured(): boolean {
  return env.mailProvider === 'resend' || env.mailProvider === 'sendgrid'
}
