import crypto from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { resolveChannelBySignature } from '@/lib/line/signature'

const MAIN = 'main-channel-secret'
const NOTIFY = 'notify-channel-secret'
const BODY = JSON.stringify({ events: [{ type: 'message' }] })

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

describe('resolveChannelBySignature', () => {
  it('顧客対応チャネルの署名を MAIN と判定する', () => {
    expect(resolveChannelBySignature(BODY, sign(BODY, MAIN), { main: MAIN, notify: NOTIFY })).toBe('MAIN')
  })

  it('社内通知チャネルの署名を NOTIFY と判定する', () => {
    expect(resolveChannelBySignature(BODY, sign(BODY, NOTIFY), { main: MAIN, notify: NOTIFY })).toBe('NOTIFY')
  })

  /**
   * Lステップ経由の構成では顧客対応チャネルのシークレットを設定しない。
   * その状態でも社内通知チャネルの postback は必ず受理できなければならない
   * （ここが落ちると「対応済みにする」ボタンが無反応になる）。
   */
  it('顧客対応チャネルの鍵が未設定でも社内通知チャネルは判定できる', () => {
    expect(resolveChannelBySignature(BODY, sign(BODY, NOTIFY), { notify: NOTIFY })).toBe('NOTIFY')
  })

  it('社内通知チャネルの鍵が未設定でも顧客対応チャネルは判定できる', () => {
    expect(resolveChannelBySignature(BODY, sign(BODY, MAIN), { main: MAIN })).toBe('MAIN')
  })

  it('鍵が1つも無ければ null（=受理しない）', () => {
    expect(resolveChannelBySignature(BODY, sign(BODY, MAIN), {})).toBeNull()
  })

  it('署名が無ければ null', () => {
    expect(resolveChannelBySignature(BODY, null, { main: MAIN, notify: NOTIFY })).toBeNull()
  })

  it('どちらの鍵にも一致しない署名は null', () => {
    expect(resolveChannelBySignature(BODY, sign(BODY, 'someone-else'), { main: MAIN, notify: NOTIFY })).toBeNull()
  })

  it('ボディが1文字でも違えば一致しない', () => {
    const sig = sign(BODY, MAIN)
    expect(resolveChannelBySignature(BODY + ' ', sig, { main: MAIN, notify: NOTIFY })).toBeNull()
  })
})
