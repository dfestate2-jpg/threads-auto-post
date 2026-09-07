import { describe, expect, it } from 'vitest'

import { safeEqual } from '@/lib/line/signature'

/**
 * 定期実行の秘密の値は、ヘッダーとクエリ文字列の両方で受ける。
 * ここでは「どこから読むか」の分岐そのものを、Request を組み立てて確認する。
 * 起動経路を1つに縛ると、そこが止まったときリマインドが丸ごと止まるため。
 */
function readPresented(request: Request): string | null {
  const fromQuery = (() => {
    try {
      const params = new URL(request.url).searchParams
      return params.get('secret') ?? params.get('cron_secret') ?? params.get('token')
    } catch {
      return null
    }
  })()
  return (
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer /, '') ??
    fromQuery
  )
}

const SECRET = 'cron-secret-value'
const BASE = 'https://example.test/api/cron/reminders'

describe('定期実行の認証情報の受け取り', () => {
  it('x-cron-secret ヘッダーから読める', () => {
    const r = new Request(BASE, { headers: { 'x-cron-secret': SECRET } })
    expect(safeEqual(readPresented(r), SECRET)).toBe(true)
  })

  it('Authorization: Bearer から読める', () => {
    const r = new Request(BASE, { headers: { authorization: `Bearer ${SECRET}` } })
    expect(safeEqual(readPresented(r), SECRET)).toBe(true)
  })

  it('クエリ文字列 secret から読める（ヘッダーを付けられないスケジューラー向け）', () => {
    const r = new Request(`${BASE}?secret=${SECRET}`)
    expect(safeEqual(readPresented(r), SECRET)).toBe(true)
  })

  it('クエリ文字列 token / cron_secret でも読める', () => {
    expect(safeEqual(readPresented(new Request(`${BASE}?token=${SECRET}`)), SECRET)).toBe(true)
    expect(safeEqual(readPresented(new Request(`${BASE}?cron_secret=${SECRET}`)), SECRET)).toBe(true)
  })

  it('ヘッダーがあればクエリ文字列より優先される', () => {
    const r = new Request(`${BASE}?secret=wrong`, { headers: { 'x-cron-secret': SECRET } })
    expect(safeEqual(readPresented(r), SECRET)).toBe(true)
  })

  it('何も付いていなければ null', () => {
    expect(readPresented(new Request(BASE))).toBeNull()
  })

  it('値が違えば一致しない', () => {
    expect(safeEqual(readPresented(new Request(`${BASE}?secret=wrong`)), SECRET)).toBe(false)
  })
})
