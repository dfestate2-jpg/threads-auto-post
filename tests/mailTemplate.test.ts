import { describe, expect, it } from 'vitest'

import { formatPrice, renderMessage, type TemplateProperty } from '@/lib/email/template'
import { buildUnsubscribeUrl, createUnsubscribeToken, parseUnsubscribeToken } from '@/lib/email/unsubscribe'

const SENDER = { org: '株式会社テスト不動産', address: '東京都新宿区1-1-1', tel: '03-0000-0000' }

const PROPERTY: TemplateProperty = {
  title: '世田谷区 中古マンション',
  propertyType: 'MANSION',
  area: '世田谷区',
  address: '東京都世田谷区2-2-2',
  price: 5480,
  layout: '3LDK',
  sizeSqm: 72.5,
  stationAccess: '三軒茶屋駅 徒歩7分',
  description: '南向き・角部屋',
  url: 'https://example.com/p/1',
}

function render(overrides: Partial<Parameters<typeof renderMessage>[0]> = {}) {
  return renderMessage({
    subject: '{{name}}様へ 新着物件のご案内',
    body: '{{name}}様\n\nご案内です。\n\n{{properties}}\n\nよろしくお願いします。',
    recipient: { name: '山田' },
    properties: [PROPERTY],
    unsubscribeUrl: 'https://app.example.com/api/unsubscribe?t=abc',
    sender: SENDER,
    ...overrides,
  })
}

describe('formatPrice', () => {
  it('万円・億円に整形する', () => {
    expect(formatPrice(5480)).toBe('5,480万円')
    expect(formatPrice(10000)).toBe('1億円')
    expect(formatPrice(12000)).toBe('1億2,000万円')
    expect(formatPrice(null)).toBeNull()
  })
})

describe('renderMessage', () => {
  it('件名と本文に名前を差し込む', () => {
    const m = render()
    expect(m.subject).toBe('山田様へ 新着物件のご案内')
    expect(m.text).toContain('山田様')
  })

  it('名前が無ければ「お客」にする（「様」と繋がる形にする）', () => {
    const m = render({ recipient: { name: null } })
    expect(m.text).toContain('お客様')
  })

  it('物件情報をテキストとHTMLの両方に展開する', () => {
    const m = render()
    expect(m.text).toContain('世田谷区 中古マンション')
    expect(m.text).toContain('5,480万円')
    expect(m.text).toContain('三軒茶屋駅 徒歩7分')
    expect(m.html).toContain('世田谷区 中古マンション')
    expect(m.html).toContain('https://example.com/p/1')
  })

  it('本文に書かなくても、送信者情報と配信停止リンクが必ず付く（法定表示）', () => {
    const m = render({ body: '本文だけ' })
    expect(m.text).toContain('株式会社テスト不動産')
    expect(m.text).toContain('東京都新宿区1-1-1')
    expect(m.text).toContain('https://app.example.com/api/unsubscribe?t=abc')
    expect(m.html).toContain('株式会社テスト不動産')
    expect(m.html).toContain('/api/unsubscribe?t=abc')
  })

  it('本文のHTML特殊文字をエスケープする（差し込み経由の混入も防ぐ）', () => {
    const m = render({ body: '<script>alert(1)</script>', properties: [] })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('宛名に含まれるHTMLもエスケープする', () => {
    const m = render({ recipient: { name: '<b>山田</b>' }, body: '{{name}}様', properties: [] })
    expect(m.html).not.toContain('<b>山田</b>')
    expect(m.html).toContain('&lt;b&gt;')
  })

  it('件名に改行を混ぜられない（ヘッダインジェクション対策）', () => {
    const m = render({ subject: '件名\r\nBcc: attacker@example.com' })
    expect(m.subject).not.toContain('\n')
    expect(m.subject).not.toContain('\r')
  })

  it('知らない差し込み変数は消さずに残す（テスト送信で気づけるように）', () => {
    const m = render({ body: 'こんにちは {{unknown_var}}', properties: [] })
    expect(m.text).toContain('{{unknown_var}}')
  })
})

describe('配信停止トークン', () => {
  const SECRET = 'test-secret-value'

  it('署名を検証して復元できる', () => {
    const token = createUnsubscribeToken({ c: 'contact-1', k: 'campaign-1' }, SECRET)
    expect(parseUnsubscribeToken(token, SECRET)).toEqual({ c: 'contact-1', k: 'campaign-1' })
  })

  it('鍵が違えば拒否する', () => {
    const token = createUnsubscribeToken({ c: 'contact-1' }, SECRET)
    expect(parseUnsubscribeToken(token, 'another-secret')).toBeNull()
  })

  it('改竄されたトークンを拒否する', () => {
    const token = createUnsubscribeToken({ c: 'contact-1' }, SECRET)
    const [body] = token.split('.')
    const forged = `${Buffer.from(JSON.stringify({ c: 'contact-999' }), 'utf8').toString('base64url')}.${token.split('.')[1]}`
    expect(parseUnsubscribeToken(forged, SECRET)).toBeNull()
    expect(parseUnsubscribeToken(body, SECRET)).toBeNull()
    expect(parseUnsubscribeToken(null, SECRET)).toBeNull()
  })

  it('URL を組み立てられる', () => {
    const url = buildUnsubscribeUrl('https://app.example.com/', 'tok+en')
    expect(url).toBe('https://app.example.com/api/unsubscribe?t=tok%2Ben')
  })
})
