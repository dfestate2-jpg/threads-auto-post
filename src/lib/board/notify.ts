/**
 * 追客ボードの通知を LINE へ送る。
 *
 * ボタンは **postback ではなくリンク（URI）** にしてある。postback の受け口は
 * 稼働中のリマインドシステムの中にあり、そこには触れないと決めたため。
 * リンクなら、押した先がこのシステムの中なので、既存のコードを1行も変えずに済む。
 *
 * 送信そのものも、既存の client.ts を経由せずここで完結させている。
 * 同じ理由で、リマインド側の送信経路には手を入れない。
 */
import { env } from '@/lib/env'

const ENDPOINT = 'https://api.line.me/v2/bot/message/push'

/** LINEのボタンテンプレートは4つまで。ラベルは20文字まで */
const MAX_ACTIONS = 4
const MAX_LABEL = 20
/** ボタンテンプレートの本文欄の上限 */
const MAX_PROMPT = 160
const MAX_TEXT = 4900

export interface BoardLinkAction {
  label: string
  /** 押したときに開くURL */
  uri: string
}

export class BoardNotifyError extends Error {
  constructor(readonly status: number, body: string) {
    super(`LINE送信に失敗しました (${status}): ${body.slice(0, 200)}`)
    this.name = 'BoardNotifyError'
  }
}

/**
 * 本文＋ボタンを1リクエストで送る。
 *
 * LINEの課金はリクエスト単位なので、2つのメッセージを束ねても通数は増えない。
 * 本文をテキスト側に置くのは、ボタンテンプレートの本文欄が160文字しか
 * 入らないため。
 */
export async function pushWithLinks(
  accessToken: string,
  to: string,
  text: string,
  prompt: string,
  actions: BoardLinkAction[],
): Promise<void> {
  const buttons = actions.slice(0, MAX_ACTIONS).map((a) => ({
    type: 'uri',
    label: a.label.slice(0, MAX_LABEL),
    uri: a.uri,
  }))

  const messages: unknown[] = [{ type: 'text', text: text.slice(0, MAX_TEXT) }]
  if (buttons.length > 0) {
    messages.push({
      type: 'template',
      altText: prompt.slice(0, 400),
      template: { type: 'buttons', text: prompt.slice(0, MAX_PROMPT), actions: buttons },
    })
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to, messages }),
  })

  if (!res.ok) {
    throw new BoardNotifyError(res.status, await res.text().catch(() => ''))
  }
}

/** 社内通知に使うアクセストークン。個人LINEへ送る Bot が別なら、そちらを使う */
export function notifyAccessToken(): string {
  return env.lineNotifyAccessToken
}

/**
 * ボタンのリンク先を組み立てる。
 *
 * 本番URLが設定されていないと、押せないリンクを送ってしまう。
 * その場合は null を返し、呼び出し側はボタン無しで本文だけ送る
 * （ボタンが出ないことより、通知が飛ばないことのほうが重大なため）。
 */
export function actionUrl(token: string): string | null {
  const base = env.appBaseUrl.replace(/\/$/, '')
  if (!base) return null
  return `${base}/board/a/${encodeURIComponent(token)}`
}
