'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * 一覧・ダッシュボードを定期的に再取得して、見落としを減らす。
 *
 * ただし更新のたびにサーバーが動くので、開きっぱなしのタブが
 * ホスティングの利用枠を静かに食い潰す。実際に無料枠を使い切った。
 *
 * そこで2つの工夫を入れている。
 * - **見えていないタブでは更新しない。** 背面に置きっぱなしのタブは
 *   誰も見ていないので、更新しても意味がない
 * - **見えた瞬間に更新する。** 間隔を延ばしても、実際に見るときは最新になる
 *
 * 結果として、消費は減るのに「見たときの鮮度」はむしろ上がる。
 */
export function AutoRefresh({ seconds = 300 }: { seconds?: number }) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined

    const stop = (): void => {
      if (timer) clearInterval(timer)
      timer = undefined
    }
    const start = (): void => {
      stop()
      timer = setInterval(() => router.refresh(), seconds * 1000)
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        router.refresh()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router, seconds])

  return null
}
