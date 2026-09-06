import { beforeEach, describe, expect, it, vi } from 'vitest'

import { claimAutoReload, isStaleAssetError } from '@/lib/staleAsset'

function installSessionStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  return store
}

describe('isStaleAssetError', () => {
  it('Chromeのチャンク読み込み失敗を拾う', () => {
    expect(isStaleAssetError({ name: 'ChunkLoadError', message: 'Loading chunk 123 failed.' })).toBe(true)
  })

  it('動的インポートの失敗を拾う', () => {
    expect(isStaleAssetError({ name: 'TypeError', message: 'Failed to fetch dynamically imported module' })).toBe(true)
  })

  /**
   * Safari は読み込み失敗を `Load failed` としか言わない。
   * ここを落とすと Safari だけ自動回復がまったく効かなくなり、
   * 実際に「パソコンだとよくエラー画面になる」として表面化した。
   */
  it('Safariの素っ気ない Load failed を拾う', () => {
    expect(isStaleAssetError({ name: 'TypeError', message: 'Load failed' })).toBe(true)
  })

  it('Safariのモジュール読み込み失敗を拾う', () => {
    expect(isStaleAssetError({ name: 'TypeError', message: 'Importing a module script failed.' })).toBe(true)
  })

  it('業務ロジックの例外は拾わない（リロードしても直らないため）', () => {
    expect(isStaleAssetError({ name: 'Error', message: '担当者が見つかりません' })).toBe(false)
  })

  it('name / message が無くても落ちない', () => {
    expect(isStaleAssetError({})).toBe(false)
  })
})

describe('claimAutoReload', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('初回は自動リロードを許す', () => {
    installSessionStorage()
    expect(claimAutoReload(1_000)).toBe(true)
  })

  it('同じ窓の中では上限2回まで', () => {
    installSessionStorage()
    expect(claimAutoReload(1_000)).toBe(true)
    expect(claimAutoReload(2_000)).toBe(true)
    expect(claimAutoReload(3_000)).toBe(false)
    expect(claimAutoReload(4_000)).toBe(false)
  })

  /**
   * ここが今回の不具合の本体。
   * 「1回だけ」の立てっぱなしフラグだと、一度回復したタブは次のデプロイで
   * 再びチャンクエラーになっても自動回復しなくなる。
   * 開きっぱなしのタブほど古くなりやすく、いちばん助けたい相手を見捨てていた。
   */
  it('時間が経てばまた自動リロードできる', () => {
    installSessionStorage()
    expect(claimAutoReload(1_000)).toBe(true)
    expect(claimAutoReload(2_000)).toBe(true)
    expect(claimAutoReload(3_000)).toBe(false)

    const later = 1_000 + 5 * 60 * 1000
    expect(claimAutoReload(later)).toBe(true)
  })

  it('窓は最初の1回目から数える（毎回延長されない）', () => {
    installSessionStorage()
    expect(claimAutoReload(0)).toBe(true)
    expect(claimAutoReload(4 * 60 * 1000)).toBe(true)
    // 起点は 0 なので、5分後には窓が切れて再び許される
    expect(claimAutoReload(5 * 60 * 1000 + 1)).toBe(true)
  })

  it('壊れた記録は初回扱いにする', () => {
    installSessionStorage({ 'stale-asset-reloads': 'not json' })
    expect(claimAutoReload(1_000)).toBe(true)
  })

  it('型の合わない記録も初回扱いにする', () => {
    installSessionStorage({ 'stale-asset-reloads': '{"n":"2","t":null}' })
    expect(claimAutoReload(1_000)).toBe(true)
  })

  /** 回数を数えられない以上、無限リロードの危険を冒せない */
  it('sessionStorage が使えなければ自動リロードしない', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => undefined,
    })
    expect(claimAutoReload(1_000)).toBe(false)
  })

  it('読めるが書けない場合も自動リロードしない', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
    })
    expect(claimAutoReload(1_000)).toBe(false)
  })
})
