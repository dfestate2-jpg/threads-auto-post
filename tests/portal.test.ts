import { describe, expect, it } from 'vitest'

import {
  ACCENT_KEYS,
  DEFAULT_ACCENT,
  DEFAULT_ICON,
  accentOf,
  assignSortOrders,
  canAccess,
  isInternalUrl,
  moveInOrder,
  nextSortOrder,
  normalizeAccent,
  normalizeIcon,
  normalizeName,
  normalizeSystemUrl,
} from '@/lib/domain/portal'

describe('normalizeSystemUrl', () => {
  it('https の絶対URLをそのまま受け入れる', () => {
    expect(normalizeSystemUrl('https://example.com/remind')).toBe('https://example.com/remind')
  })

  it('前後の空白を落とす', () => {
    expect(normalizeSystemUrl('  https://example.com/  ')).toBe('https://example.com/')
  })

  it('スキーム無しの入力には https を補う', () => {
    expect(normalizeSystemUrl('example.com/remind')).toBe('https://example.com/remind')
  })

  it('社内システムをhttpで運用している場合も許可する', () => {
    expect(normalizeSystemUrl('http://192.168.1.10:3000/')).toBe('http://192.168.1.10:3000/')
  })

  it('サイト内のパスを許可する', () => {
    expect(normalizeSystemUrl('/customers')).toBe('/customers')
    expect(normalizeSystemUrl('/')).toBe('/')
  })

  it('プロトコル相対URLは外部サイトなので弾く', () => {
    expect(normalizeSystemUrl('//evil.example.com')).toBeNull()
  })

  it('javascript: / data: を弾く', () => {
    expect(normalizeSystemUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeSystemUrl('JavaScript:alert(1)')).toBeNull()
    expect(normalizeSystemUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normalizeSystemUrl('file:///etc/passwd')).toBeNull()
  })

  it('空文字を弾く', () => {
    expect(normalizeSystemUrl('')).toBeNull()
    expect(normalizeSystemUrl('   ')).toBeNull()
  })
})

describe('isInternalUrl', () => {
  it('サイト内リンクを見分ける', () => {
    expect(isInternalUrl('/customers')).toBe(true)
    expect(isInternalUrl('/')).toBe(true)
    expect(isInternalUrl('https://example.com')).toBe(false)
  })
})

describe('normalizeName', () => {
  it('前後の空白と連続空白を整える', () => {
    expect(normalizeName('  顧客  管理 ')).toBe('顧客 管理')
  })

  it('空文字と長すぎる名前を弾く', () => {
    expect(normalizeName('   ')).toBeNull()
    expect(normalizeName('あ'.repeat(41))).toBeNull()
    expect(normalizeName('あ'.repeat(40))).toBe('あ'.repeat(40))
  })
})

describe('normalizeIcon', () => {
  it('未指定なら既定のアイコンを使う', () => {
    expect(normalizeIcon(null)).toBe(DEFAULT_ICON)
    expect(normalizeIcon('  ')).toBe(DEFAULT_ICON)
  })

  it('絵文字はそのまま通す', () => {
    expect(normalizeIcon('🔔')).toBe('🔔')
  })

  it('長い文字列はカードが崩れるので切り詰める', () => {
    expect(Array.from(normalizeIcon('あいうえおかきくけこ')).length).toBe(4)
  })
})

describe('normalizeAccent', () => {
  it('未知の色は既定に落とす', () => {
    expect(normalizeAccent('neon')).toBe(DEFAULT_ACCENT)
    expect(normalizeAccent(null)).toBe(DEFAULT_ACCENT)
  })

  it('用意した色はそのまま使う', () => {
    for (const key of ACCENT_KEYS) expect(normalizeAccent(key)).toBe(key)
  })

  it('accentOf は未知の色でも必ずクラスを返す', () => {
    expect(accentOf('neon').tile).toBe(accentOf(DEFAULT_ACCENT).tile)
  })
})

describe('canAccess', () => {
  it('自分の権限以下のシステムだけ見える', () => {
    expect(canAccess('STAFF', 'STAFF')).toBe(true)
    expect(canAccess('STAFF', 'MANAGER')).toBe(false)
    expect(canAccess('STAFF', 'ADMIN')).toBe(false)
    expect(canAccess('MANAGER', 'MANAGER')).toBe(true)
    expect(canAccess('MANAGER', 'ADMIN')).toBe(false)
    expect(canAccess('ADMIN', 'ADMIN')).toBe(true)
    expect(canAccess('ADMIN', 'STAFF')).toBe(true)
  })
})

describe('表示順', () => {
  it('1件も無ければ 0 から始める', () => {
    expect(nextSortOrder([])).toBe(0)
  })

  it('末尾に追加するときは最大値の次にする', () => {
    expect(nextSortOrder([0, 10, 20])).toBe(30)
    expect(nextSortOrder([50, 10])).toBe(60)
  })

  it('並び替え後は 0,10,20... で振り直す', () => {
    expect(assignSortOrders(3)).toEqual([0, 10, 20])
    expect(assignSortOrders(0)).toEqual([])
  })
})

describe('moveInOrder', () => {
  const items = ['a', 'b', 'c']

  it('1つ上へ入れ替える', () => {
    expect(moveInOrder(items, 1, 'up')).toEqual(['b', 'a', 'c'])
  })

  it('1つ下へ入れ替える', () => {
    expect(moveInOrder(items, 1, 'down')).toEqual(['a', 'c', 'b'])
  })

  it('端では何も起きない（同じ配列を返す）', () => {
    expect(moveInOrder(items, 0, 'up')).toBe(items)
    expect(moveInOrder(items, 2, 'down')).toBe(items)
    expect(moveInOrder(items, -1, 'up')).toBe(items)
  })

  it('元の配列を書き換えない', () => {
    moveInOrder(items, 1, 'up')
    expect(items).toEqual(['a', 'b', 'c'])
  })
})
