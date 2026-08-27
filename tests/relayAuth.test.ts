import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { authenticateRelay } from '@/lib/line/relayAuth'

const SECRET = 'main-channel-secret'
const NOTIFY_SECRET = 'notify-channel-secret'
const TOKEN = 'relay-token-0123456789abcdef'
const BODY = JSON.stringify({ events: [] })

const sign = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body, 'utf8').digest('base64')

const base = {
  rawBody: BODY,
  signature: null,
  presentedToken: null,
  channelSecret: SECRET,
  notifyChannelSecret: NOTIFY_SECRET,
  expectedToken: TOKEN,
}

describe('authenticateRelay', () => {
  it('正しいLINE署名を最優先で受理する', () => {
    expect(authenticateRelay({ ...base, signature: sign(BODY, SECRET) })).toEqual({
      ok: true,
      via: 'LINE_SIGNATURE',
      channel: 'MAIN',
    })
  })

  it('社内通知チャネルの署名でも受理する', () => {
    expect(authenticateRelay({ ...base, signature: sign(BODY, NOTIFY_SECRET) })).toEqual({
      ok: true,
      via: 'LINE_SIGNATURE',
      channel: 'NOTIFY',
    })
  })

  it('署名が付いているのに合わない場合は、トークンが正しくても拒否する', () => {
    const result = authenticateRelay({
      ...base,
      signature: sign(BODY, 'wrong-secret'),
      presentedToken: TOKEN,
    })
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' })
  })

  it('署名が無い場合はトークンで受理する', () => {
    expect(authenticateRelay({ ...base, presentedToken: TOKEN })).toEqual({ ok: true, via: 'RELAY_TOKEN' })
  })

  it('トークンが違えば拒否する', () => {
    expect(authenticateRelay({ ...base, presentedToken: 'wrong' })).toEqual({ ok: false, reason: 'BAD_TOKEN' })
  })

  it('トークン未設定なら署名の無い転送は受け付けない', () => {
    const result = authenticateRelay({ ...base, presentedToken: 'anything', expectedToken: undefined })
    expect(result).toEqual({ ok: false, reason: 'NO_CREDENTIAL' })
  })

  it('資格情報が何も無ければ拒否する', () => {
    expect(authenticateRelay(base)).toEqual({ ok: false, reason: 'NO_CREDENTIAL' })
  })

  it('ボディが1文字でも違えば署名は通らない', () => {
    const result = authenticateRelay({
      ...base,
      rawBody: `${BODY} `,
      signature: sign(BODY, SECRET),
    })
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' })
  })
})
