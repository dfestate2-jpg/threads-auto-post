'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * 選択した未返信をまとめて「対応済み」にする操作バー。
 *
 * 件数が溜まったとき、1件ずつ押すのは現実的ではない。
 * ただし **対応済みはリマインドを止める確定操作** なので、
 * 1件ずつのボタン（6秒の取り消し付き）と違って **押す前に一度確認する**。
 * 複数件まとめては取り消しの粒度が合わず、どれが戻ったのか分からなくなる。
 */
export function BulkResolveBar({
  selected,
  onDone,
  onClear,
}: {
  /** 選択中の顧客。version は楽観ロックに使う */
  selected: { customerId: string; version: number }[]
  /** 成功した件数を渡して、呼び出し側の選択状態を片付けさせる */
  onDone: (resolvedCount: number) => void
  onClear: () => void
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (selected.length === 0) return null

  async function run(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/reminders/bulk-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setMessage(body?.error ?? '対応済みにできませんでした')
        return
      }
      const data = (await res.json()) as {
        resolved: number
        skipped: { customerId: string; reason: string }[]
      }

      /**
       * 閉じられなかった件数は必ず出す。
       * 「10件選んだのに8件しか閉じていない」ことが黙って起きると、
       * 残り2件が放置されたまま気づけない。
       */
      setMessage(
        data.skipped.length > 0
          ? `${data.resolved}件を対応済みにしました。${data.skipped.length}件は閉じられませんでした（他の人が更新した／新しいメッセージが届いた可能性があります）。一覧を見直してください。`
          : `${data.resolved}件を対応済みにしました。`,
      )
      setConfirming(false)
      onDone(data.resolved)
      router.refresh()
    } catch {
      setMessage('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sticky bottom-0 z-10 mt-3 rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{selected.length}件 選択中</span>

        {confirming ? (
          <>
            <span className="text-sm text-slate-700">
              {selected.length}件を対応済みにします。リマインドが止まります。よろしいですか？
            </span>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void run()}>
              {busy ? '処理中…' : 'はい、対応済みにする'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>
              やめる
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary" onClick={() => setConfirming(true)}>
              ✅ {selected.length}件を対応済みにする
            </button>
            <button type="button" className="btn" onClick={onClear}>
              選択を解除
            </button>
          </>
        )}
      </div>

      {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}

      <p className="mt-2 text-xs text-slate-500">
        返信していないお客様を対応済みにすると、以後リマインドされません。選択した相手に返信済みか確認してください。
      </p>
    </div>
  )
}
