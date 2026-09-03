/**
 * ステートレスチャネルアクセストークンの発行。
 *
 * 顧客の表示名を取るには顧客対応チャネル（でふでふ不動産）のアクセストークンが要るが、
 * そのチャネルの LINE Developers 権限が社内に無く、トークンを取り出せないことがある。
 * その場合でも **チャネルID＋チャネルシークレット** があればトークンを発行できる。
 *
 * ⚠️⚠️ 使うエンドポイントを間違えてはいけない ⚠️⚠️
 *
 *   ✅ POST /oauth2/v3/token        … ステートレス。有効15分。**発行数に上限が無く、
 *                                     既存のトークンに一切影響しない**
 *   ❌ POST /v2/oauth/accessToken   … 30日間有効。**同時に有効なのは30個まで**で、
 *                                     超えると古いものから無効化される
 *
 * ここで ❌ を使うと、発行を重ねるうちに **Lステップが使っているトークンを
 * 押し出して無効化し、Lステップが止まる。** 顧客名を出したいだけの機能で
 * 会社の顧客対応そのものを壊すことになるため、絶対に切り替えないこと。
 *
 * 有効期限が15分と短いので、都度発行せず短時間だけメモリに持つ。
 * サーバーレスでインスタンスが使い捨てられる環境では効かないこともあるが、
 * その場合も「毎回発行する」だけで、上限が無いため問題にならない。
 */
const TOKEN_ENDPOINT = 'https://api.line.me/oauth2/v3/token'

/** 期限ぎりぎりのトークンを掴まないための余裕 */
const EXPIRY_MARGIN_MS = 60_000

interface CachedToken {
  token: string
  expiresAt: number
}

const cache = new Map<string, CachedToken>()

interface TokenResponse {
  access_token?: unknown
  expires_in?: unknown
}

/**
 * チャネルID＋シークレットから、15分だけ有効なトークンを得る。
 * 取得できなければ null。**呼び出し側は「名前が付かないだけ」で先に進むこと。**
 */
export async function getStatelessChannelAccessToken(
  channelId: string,
  channelSecret: string,
  now = Date.now(),
): Promise<string | null> {
  const cached = cache.get(channelId)
  if (cached && cached.expiresAt > now) return cached.token

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: channelId,
        client_secret: channelSecret,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      // 本文にシークレットは含まれないが、ログに残すのは状態コードだけにする
      console.warn('[line-token] ステートレストークンの発行に失敗しました', { status: res.status })
      return null
    }
    const json = (await res.json()) as TokenResponse
    const token = typeof json.access_token === 'string' ? json.access_token : null
    if (!token) return null

    const expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 900
    cache.set(channelId, { token, expiresAt: now + Math.max(0, expiresInSec * 1000 - EXPIRY_MARGIN_MS) })
    return token
  } catch (e) {
    console.warn('[line-token] ステートレストークンの発行に失敗しました', { message: (e as Error).message })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** テスト用。プロセスを跨いで残す値ではない */
export function clearStatelessTokenCache(): void {
  cache.clear()
}
