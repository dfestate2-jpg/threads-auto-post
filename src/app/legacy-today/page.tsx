import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * ログイン後のトップ。
 *
 * 追客ボードの「今日やること」へ送る。
 * 旧・追客の画面は /legacy-today に残してあるが、導線からは外してある。
 * 入口が2つあると、片方が必ず放置されるため。
 */
export default function HomePage() {
  redirect('/board/today')
}
