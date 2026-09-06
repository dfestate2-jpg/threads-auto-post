/**
 * Lステップの「Webhook転送」から届いたリクエストボディを解釈する。
 *
 * LINE公式アカウントから直接届く場合の形は `{ destination, events: [...] }` で固定だが、
 * **転送されてくるときの外側の包み方は公開資料で確定できない。**
 * 実運用でありがちな形（そのまま / body で包む / payload で包む / イベント1件だけ）を
 * すべて受け付ける。判断がつかない形は空配列を返し、呼び出し側が診断ログを出す。
 *
 * 「転送の形が想定と違ったので未返信を取りこぼした」が最悪なので、
 * ここは寛容に受け、受け取れなかったことは必ず記録に残す方針にしている。
 */
import type { LineWebhookEvent } from './types'

/** 外側の包みを剥がすときに見にいくキー。よくある命名を順に試す */
const ENVELOPE_KEYS = ['body', 'payload', 'data', 'webhook', 'original'] as const
const MAX_DEPTH = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** LINE のイベントとして最低限の形をしているか */
function looksLikeEvent(value: unknown): value is LineWebhookEvent {
  if (!isRecord(value)) return false
  if (typeof value.type !== 'string' || value.type.length === 0) return false
  if (typeof value.timestamp !== 'number') return false
  return isRecord(value.source)
}

function fromArray(value: unknown): LineWebhookEvent[] | null {
  if (!Array.isArray(value)) return null
  const events = value.filter(looksLikeEvent)
  return events.length > 0 ? events : null
}

/**
 * 転送ボディから LINE イベント列を取り出す。
 * 取り出せなければ空配列（＝処理対象なし）を返す。
 */
export function extractLineEvents(body: unknown, depth = 0): LineWebhookEvent[] {
  if (depth > MAX_DEPTH) return []

  // ① イベントの配列がそのまま来た
  const bare = fromArray(body)
  if (bare) return bare

  // ② イベント1件だけが来た
  if (looksLikeEvent(body)) return [body]

  if (!isRecord(body)) return []

  // ③ 標準形 `{ events: [...] }`
  const direct = fromArray(body.events)
  if (direct) return direct

  // ④ 何かで包まれている
  for (const key of ENVELOPE_KEYS) {
    if (!(key in body)) continue
    const inner = body[key]
    // 文字列で包まれている（JSON文字列として渡される実装があるため）
    if (typeof inner === 'string') {
      try {
        const parsed: unknown = JSON.parse(inner)
        const events = extractLineEvents(parsed, depth + 1)
        if (events.length > 0) return events
      } catch {
        continue
      }
      continue
    }
    const events = extractLineEvents(inner, depth + 1)
    if (events.length > 0) return events
  }

  return []
}

/**
 * 診断用。受け取ったボディの「形」だけを返す（値は含めない）。
 * 転送形式が想定と違ったとき、何が来たのかを安全にログへ出すために使う。
 */
export function describeShape(body: unknown, depth = 0): string {
  if (depth > 2) return '…'
  if (Array.isArray(body)) return `array(${body.length})`
  if (body === null) return 'null'
  if (typeof body !== 'object') return typeof body
  const keys = Object.keys(body as Record<string, unknown>).slice(0, 20)
  return `{${keys.map((k) => `${k}:${describeShape((body as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`
}
