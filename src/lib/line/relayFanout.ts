/**
 * 受け取ったLINEのイベントを、もう1か所へそのまま流す。
 *
 * 回答フォームの内容をお客様へ届ける別システムが、「このイベントが誰から来たか」を
 * 知るために使う。そちらは送信完了ページでしかユーザーIDを取れず、
 * お客様がページを閉じると回答を届けられないまま残っていた。
 *
 * 決めごと:
 *   - 本来の処理（未返信の検知・リマインド）が終わったあとに呼ぶ。
 *     ここで何が起きても、リマインドの正しさには影響しない。
 *   - 生の本文と署名をそのまま渡す。組み直すと相手側の署名検証が通らない。
 *   - 3秒で打ち切る。相手が止まっていても、こちらの応答を巻き込まない。
 *   - 失敗しても投げない。転送できないことは、リマインドを止める理由にならない。
 */
const TIMEOUT_MS = 3_000

export async function fanoutLineRelay(
  rawBody: string,
  signature: string | null,
  url: string | undefined,
): Promise<void> {
  if (!url) return

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (signature) headers['x-line-signature'] = signature

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn('[line-relay] 横流し先が受け取りませんでした', { status: res.status })
    }
  } catch (e) {
    // 相手の停止・遅延・ネットワーク断。こちらは何も止めない
    console.warn('[line-relay] 横流しできませんでした', {
      reason: e instanceof Error ? e.name : 'unknown',
    })
  } finally {
    clearTimeout(timer)
  }
}
