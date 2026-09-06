import { afterEach, describe, expect, it, vi } from 'vitest'

import { fanoutLineRelay } from '@/lib/line/relayFanout'

const 本文 = '{"events":[{"type":"message"}]}'
const 署名 = 'abc123'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LINEイベントの横流し', () => {
  it('転送先が未設定なら何もしない', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await fanoutLineRelay(本文, 署名, undefined)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('生の本文と署名をそのまま渡す', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await fanoutLineRelay(本文, 署名, 'https://example.test/hook')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.test/hook')
    // 組み直すと相手側の署名検証が通らなくなる
    expect(init.body).toBe(本文)
    expect((init.headers as Record<string, string>)['x-line-signature']).toBe(署名)
  })

  it('署名が無いときはヘッダを付けない', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await fanoutLineRelay(本文, null, 'https://example.test/hook')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['x-line-signature']).toBeUndefined()
  })

  it('相手が落ちていても例外を投げない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))
    await expect(fanoutLineRelay(本文, 署名, 'https://example.test/hook')).resolves.toBeUndefined()
  })

  it('相手がエラーを返しても例外を投げない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(fanoutLineRelay(本文, 署名, 'https://example.test/hook')).resolves.toBeUndefined()
  })
})
