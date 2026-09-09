import { describe, expect, it } from 'vitest'

import { THEME_INIT_SCRIPT, THEME_KEY, isThemeChoice, resolveTheme } from '../src/lib/theme'

describe('画面の明るさ', () => {
  it('選んだ値をそのまま使う', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('「端末に合わせる」のときだけ端末の設定に従う', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('保存されている値だけを受け入れる', () => {
    expect(isThemeChoice('dark')).toBe(true)
    expect(isThemeChoice('system')).toBe(true)
    // 古い値・壊れた値が入っていても、そこで落ちない
    expect(isThemeChoice(null)).toBe(false)
    expect(isThemeChoice('DARK')).toBe(false)
    expect(isThemeChoice('')).toBe(false)
  })

  it('先読みスクリプトと画面が同じ鍵を見る', () => {
    // 別々の鍵になると、読み込み直後だけ明るさが食い違う
    expect(THEME_INIT_SCRIPT).toContain(`'${THEME_KEY}'`)
  })

  it('先読みスクリプトは失敗しても画面を止めない', () => {
    // localStorage が使えない環境（プライベートウィンドウ等）で
    // 例外が漏れると、そこから先のスクリプトが動かなくなる
    expect(THEME_INIT_SCRIPT).toContain('try{')
    expect(THEME_INIT_SCRIPT).toContain('catch(e){}')
  })

  it('先読みスクリプトに外から来た文字列を混ぜない', () => {
    // HTML へそのまま書き出すので、閉じタグが作れると差し込みになる
    expect(THEME_INIT_SCRIPT).not.toContain('</')
  })
})
