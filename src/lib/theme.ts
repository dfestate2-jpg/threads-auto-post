/**
 * 画面の明るさ（ライト / ダーク）の決まりごと。
 *
 * 端末ごとの設定にしてある。サーバーには保存しない。
 * 同じ人でも事務所のパソコンとスマホでは明るさの都合が違うし、
 * 目の疲れ方は人それぞれで、他人の画面まで変わってしまうのは困るため。
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

/** localStorage の鍵。画面側とスクリプト側で同じ文字列を使う */
export const THEME_KEY = 'theme'

export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: '端末に合わせる',
  light: 'ライト',
  dark: 'ダーク',
}

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'system' || v === 'light' || v === 'dark'
}

/**
 * 最初の描画より前に走らせる小さなスクリプト。
 *
 * React が動き出してから色を変えると、**一瞬だけ白い画面が出てから暗くなる。**
 * 目を休めるための機能でこれをやると本末転倒なので、
 * HTML の読み込み時点で `<html>` に印を付けてしまう。
 *
 * localStorage が使えない環境（プライベートウィンドウ等）でも落ちないよう、
 * まるごと try で囲ってある。読めなければライトのまま＝いままでと同じ。
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var c=localStorage.getItem('${THEME_KEY}');
if(c!=='light'&&c!=='dark'){c=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.setAttribute('data-theme',c);
}catch(e){}})()`

/** 選んだ値から、実際に当てる見た目を決める */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  if (choice === 'system') return prefersDark ? 'dark' : 'light'
  return choice
}
