'use client'

import { useEffect, useState } from 'react'

import { THEME_KEY, THEME_LABEL, isThemeChoice, resolveTheme, type ThemeChoice } from '@/lib/theme'

const CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

/**
 * 画面の明るさを切り替える。
 *
 * ヘッダーに置いてある。設定画面の奥に入れると、目が疲れたその場で
 * 変えられない——**変えたくなるのは使っている最中**なので、
 * どの画面からでも1タップで届く場所に置く。
 *
 * 「端末に合わせる」は、パソコンやスマホ側の設定に追従する。
 * 夜になると自動で暗くなる端末なら、そのまま暗くなる。
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system')
  // サーバー側では端末の設定を知りようがない。描き分けは画面に出てからにする
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(THEME_KEY)
    } catch {
      // 保存が使えない環境。既定のまま動かす
    }
    if (isThemeChoice(saved)) setChoice(saved)
    setReady(true)
  }, [])

  /**
   * 選ばれている見た目を、画面に当て直す。
   *
   * 保存値を読むのは最初の描画より後なので、その一瞬だけ choice は
   * 既定の 'system' になっている。**当て直しを「端末に合わせる」の
   * ときだけにすると、保存した「ダーク」がここで捨てられてライトに戻る。**
   * 当てるのは常に行い、端末の切り替えを聞くのだけを 'system' に限る。
   */
  useEffect(() => {
    if (!ready) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.setAttribute('data-theme', resolveTheme(choice, mq.matches))
    }
    apply()
    if (choice !== 'system') return
    // 夜間モードに入った瞬間、画面を開いたままでも暗くなる
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [choice, ready])

  function pick(next: ThemeChoice): void {
    setChoice(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // 保存できなくても、この画面のあいだは切り替わる
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', resolveTheme(next, prefersDark))
  }

  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-500">
      <span className="sr-only sm:not-sr-only">画面</span>
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
        value={ready ? choice : 'system'}
        aria-label="画面の明るさ"
        onChange={(e) => {
          const v = e.target.value
          if (isThemeChoice(v)) pick(v)
        }}
      >
        {CHOICES.map((c) => (
          <option key={c} value={c}>
            {THEME_LABEL[c]}
          </option>
        ))}
      </select>
    </label>
  )
}
