import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearStatelessTokenCache, getStatelessChannelAccessToken } from '@/lib/line/statelessToken'

const CHANNEL_ID = '2007086364'
const SECRET = 'channel-secret-for-test'

interface Called {
  url: string
  init: RequestInit
}

function stubFetch(handler: (called: Called) => Response | Promise<Response>): Called[] {
  const calls: Called[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const called = { url: String(url), init }
    calls.push(called)
    return handler(called)
  })
  return calls
}

function okToken(token: string, expiresIn = 900): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }), {
    status: 200,
  })
}

describe('statelessToken', () => {
  beforeEach(() => clearStatelessTokenCache())
  afterEach(() => vi.unstubAllGlobals())

  it('トークンを発行して返す', async () => {
    stubFetch(() => okToken('tok-1'))
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)).toBe('tok-1')
  })

  /**
   * これが崩れると Lステップが止まる。
   *
   * /v2/oauth/accessToken は「同時に有効なのは30個まで」で、超えると古いものから
   * 無効化される。発行を重ねると Lステップが使っているトークンを押し出してしまう。
   * ステートレス（/oauth2/v3/token）は発行数に上限が無く、既存トークンに影響しない。
   */
  it('発行数に上限のあるエンドポイントを絶対に使わない', async () => {
    const calls = stubFetch(() => okToken('tok-1'))
    await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)
    expect(calls[0].url).toBe('https://api.line.me/oauth2/v3/token')
    expect(calls[0].url).not.toContain('/v2/oauth/accessToken')
  })

  it('client_credentials をフォーム形式で送る', async () => {
    const calls = stubFetch(() => okToken('tok-1'))
    await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const body = new URLSearchParams(String(calls[0].init.body))
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_id')).toBe(CHANNEL_ID)
    expect(body.get('client_secret')).toBe(SECRET)
  })

  it('有効期限内は再発行しない', async () => {
    const calls = stubFetch(() => okToken('tok-1'))
    const t0 = 1_000_000
    await getStatelessChannelAccessToken(CHANNEL_ID, SECRET, t0)
    await getStatelessChannelAccessToken(CHANNEL_ID, SECRET, t0 + 60_000)
    expect(calls.length).toBe(1)
  })

  it('期限が近づいたら発行し直す', async () => {
    let n = 0
    const calls = stubFetch(() => okToken(`tok-${++n}`))
    const t0 = 1_000_000
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET, t0)).toBe('tok-1')
    // 900秒 - 余裕60秒 = 840秒後には作り直す
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET, t0 + 840_000)).toBe('tok-2')
    expect(calls.length).toBe(2)
  })

  it('チャネルが違えば別のトークンを持つ', async () => {
    let n = 0
    stubFetch(() => okToken(`tok-${++n}`))
    expect(await getStatelessChannelAccessToken('1111', SECRET)).toBe('tok-1')
    expect(await getStatelessChannelAccessToken('2222', SECRET)).toBe('tok-2')
  })

  /** 顧客名が取れないことより、取り込みが止まるほうが重大。例外を外に出さない */
  it('LINE がエラーを返しても例外にせず null を返す', async () => {
    stubFetch(() => new Response('{"error":"invalid_client"}', { status: 401 }))
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)).toBeNull()
  })

  it('通信に失敗しても例外にせず null を返す', async () => {
    stubFetch(() => {
      throw new Error('network down')
    })
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)).toBeNull()
  })

  it('access_token が入っていない応答は受け付けない', async () => {
    stubFetch(() => new Response(JSON.stringify({ expires_in: 900 }), { status: 200 }))
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)).toBeNull()
  })

  it('失敗はキャッシュしない（次の機会に再挑戦できる）', async () => {
    let first = true
    const calls = stubFetch(() => {
      if (first) {
        first = false
        return new Response('{}', { status: 500 })
      }
      return okToken('tok-ok')
    })
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)).toBeNull()
    expect(await getStatelessChannelAccessToken(CHANNEL_ID, SECRET)).toBe('tok-ok')
    expect(calls.length).toBe(2)
  })
})
