import type { LineProfile } from './types'

const LINE_API = 'https://api.line.me/v2/bot'

export class LineApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
    this.name = 'LineApiError'
  }
}

async function call(
  path: string,
  accessToken: string,
  init: { method: string; body?: unknown; timeoutMs?: number },
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000)
  try {
    const res = await fetch(`${LINE_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      // 本文にアクセストークンは含まれないが、念のため長さを制限して保持する
      throw new LineApiError(`LINE API ${init.method} ${path} failed (${res.status})`, res.status, text.slice(0, 500))
    }
    return text.length > 0 ? (JSON.parse(text) as unknown) : {}
  } finally {
    clearTimeout(timer)
  }
}

/** push メッセージ（課金対象）。to は userId / groupId / roomId */
export async function pushTextMessage(accessToken: string, to: string, text: string): Promise<void> {
  await call('/message/push', accessToken, {
    method: 'POST',
    body: { to, messages: [{ type: 'text', text: text.slice(0, 4900) }] },
  })
}

/** ボタンテンプレートで使う postback アクション */
export interface LinePostbackAction {
  label: string
  data: string
  displayText?: string
}

/**
 * 本文テキスト＋ボタンを **1リクエスト** で送る。
 *
 * LINE の課金は「リクエスト単位 × 宛先人数」なので、2メッセージ束ねても
 * 消費通数は増えない。ボタンテンプレートの text は160文字までという制限があり
 * 通知本文（数百文字）を入れられないため、本文はテキストメッセージ側に置く。
 */
export async function pushTextWithActions(
  accessToken: string,
  to: string,
  text: string,
  prompt: string,
  actions: LinePostbackAction[],
): Promise<void> {
  const buttons = actions.slice(0, 4).map((a) => ({
    type: 'postback',
    label: a.label.slice(0, 20),
    data: a.data,
    ...(a.displayText ? { displayText: a.displayText.slice(0, 300) } : {}),
  }))
  await call('/message/push', accessToken, {
    method: 'POST',
    body: {
      to,
      messages: [
        { type: 'text', text: text.slice(0, 4900) },
        {
          type: 'template',
          altText: prompt.slice(0, 400),
          template: { type: 'buttons', text: prompt.slice(0, 160), actions: buttons },
        },
      ],
    },
  })
}

/**
 * reply メッセージ（無料）。replyToken は約1分・1回のみ有効。
 * 期限切れの場合は呼び出し側で push にフォールバックする。
 */
export async function replyTextMessage(accessToken: string, replyToken: string, text: string): Promise<void> {
  await call('/message/reply', accessToken, {
    method: 'POST',
    body: { replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] },
  })
}

export async function getProfile(accessToken: string, userId: string): Promise<LineProfile | null> {
  try {
    return (await call(`/profile/${encodeURIComponent(userId)}`, accessToken, { method: 'GET' })) as LineProfile
  } catch (e) {
    // プロフィール取得失敗（ブロック済み等）は致命的ではないので握りつぶす
    if (e instanceof LineApiError) return null
    throw e
  }
}
