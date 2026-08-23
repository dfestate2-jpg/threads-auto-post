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
