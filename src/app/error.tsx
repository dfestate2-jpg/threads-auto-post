'use client'

/**
 * 画面の描画で例外が起きたときの受け皿。
 *
 * これが無いと Next.js の既定画面（英語の "Application error: a client-side
 * exception has occurred"）がそのまま出る。原因も次の一手も分からないので、
 * 業務中の人にとっては「壊れた」としか読めない。
 *
 * 特に多いのが**デプロイ直後のチャンク読み込み失敗**。
 * タブを開いたままデプロイすると、古い画面が入れ替わって消えたJSを
 * 取りに行って 404 になる。これは再読み込みすれば必ず直るので、
 * 人に見せる前に自動で回復させる。
 */
import { useEffect, useState } from 'react'

import { claimAutoReload, isStaleAssetError } from '@/lib/staleAsset'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    if (!isStaleAssetError(error)) return
    if (!claimAutoReload()) return
    setReloading(true)
    location.reload()
  }, [error])

  if (reloading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-slate-600">最新の状態に更新しています…</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-6">
        <h1 className="mb-2 text-lg font-bold">画面を表示できませんでした</h1>
        <p className="mb-4 text-sm text-slate-600">
          一時的な不具合の可能性があります。下のボタンで開き直してください。
          <br />
          <strong>リマインドの検知と通知は、この画面とは別に動き続けています。</strong>
          この画面が出ても未返信を取りこぼすことはありません。
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => location.reload()}>
            再読み込み
          </button>
          <button type="button" className="btn" onClick={() => reset()}>
            もう一度試す
          </button>
        </div>
        {/*
          原因の手がかりを画面に出しておく。社内の管理者しか見ない画面なので
          伏せる理由がなく、これが無いと「たまに出る」を報告してもらっても
          何が起きたのか特定できない。
        */}
        <p className="mt-4 break-words font-mono text-[11px] leading-relaxed text-slate-400">
          {error.name}: {error.message}
          {error.digest ? <span className="block">ID: {error.digest}</span> : null}
        </p>
      </div>
    </main>
  )
}
