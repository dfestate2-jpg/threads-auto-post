'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

interface Progress {
  resolved: number
  skipped: number
}

/**
 * 未返信をまとめて「対応済み」にする操作バー。
 *
 * **選択なしで1回押せば終わる。** チェックを1件ずつ付けるなら、
 * 1件ずつ ✅ を押すのと手間が変わらない。だから主役は
 * 「絞り込み条件のぜんぶを閉じる」ボタンで、チェックは
 * 「一部だけ閉じたい」ときの補助に下げている。
 *
 * 対象は画面の1ページではなく**絞り込み条件の全件**。見えている50件だけが
 * 閉じると「全部閉じたつもりで2ページ目が残る」という最悪の勘違いが起きる。
 *
 * ただし **対応済みはリマインドを止める確定操作** なので、押す前に一度確認する。
 * 1件ずつのボタン（6秒の取り消し付き）と違い、複数件まとめては取り消しの
 * 粒度が合わず、どれが戻ったのか分からなくなる。
 */
export function BulkResolveBar({
  selected,
  total,
  filterDescription,
  onDone,
  onClear,
}: {
  /** チェックで選んだ分。0件なら「ぜんぶ閉じる」だけを出す */
  selected: { customerId: string; version: number }[]
  /** 絞り込み条件に当てはまる全件数（ページをまたいだ合計） */
  total: number
  /** 確認文に出す絞り込みの説明 */
  filterDescription: string
  onDone: () => void
  onClear: () => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [confirming, setConfirming] = useState<'selected' | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (total === 0 && selected.length === 0) return null

  /** 選んだ分だけ閉じる */
  async function runSelected(): Promise<void> {
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
      const data = (await res.json()) as { resolved: number; skipped: { customerId: string }[] }
      setMessage(describe(data.resolved, data.skipped.length))
      setConfirming(null)
      onDone()
      router.refresh()
    } catch {
      setMessage('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 絞り込み条件のぜんぶを閉じる。
   *
   * サーバーは1回で小分けにしか処理しない（長すぎるリクエストは途中で切れ、
   * どこまで済んだか分からなくなるため）。**残りが 0 になるまで押し続けるのは
   * こちらの仕事**で、利用者には1回押しただけに見せる。
   */
  async function runAll(): Promise<void> {
    setBusy(true)
    setMessage(null)
    setProgress({ resolved: 0, skipped: 0 })

    const filter = {
      status: searchParams.get('status') ?? undefined,
      assignee: searchParams.get('assignee') ?? undefined,
      awaiting: searchParams.get('awaiting') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      over: searchParams.get('over') ?? undefined,
    }

    let resolved = 0
    let skipped = 0
    try {
      // 進まなくなったら必ず抜ける。閉じられない相手が残り続けても回し続けない
      for (let round = 0; round < 100; round += 1) {
        const res = await fetch('/api/reminders/resolve-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          setMessage(
            `${describe(resolved, skipped)} 続きの処理に失敗しました（${body?.error ?? '通信エラー'}）。一覧を見直してください。`,
          )
          return
        }
        const data = (await res.json()) as {
          resolved: number
          skipped: { customerId: string }[]
          remaining: number
        }
        resolved += data.resolved
        skipped += data.skipped.length
        setProgress({ resolved, skipped })

        if (data.remaining === 0) break
        // 1件も閉じられなかった = これ以上押しても減らない
        if (data.resolved === 0) {
          setMessage(
            `${describe(resolved, skipped)} 残り${data.remaining}件は閉じられませんでした。一覧を見直してください。`,
          )
          return
        }
      }
      setMessage(describe(resolved, skipped))
      setConfirming(null)
      onDone()
      router.refresh()
    } catch {
      setMessage(`${describe(resolved, skipped)} 通信に失敗しました。一覧を見直してください。`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  /**
   * 閉じられなかった件数は必ず出す。
   * 「10件のはずが8件しか閉じていない」ことが黙って起きると、
   * 残り2件が放置されたまま誰も気づけない。
   */
  function describe(resolved: number, skipped: number): string {
    if (skipped === 0) return `${resolved}件を対応済みにしました。`
    return `${resolved}件を対応済みにしました。${skipped}件は閉じられませんでした（他の人が更新した／新しいメッセージが届いた可能性があります）。一覧を見直してください。`
  }

  return (
    <div className="sticky bottom-0 z-10 mt-3 rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
      {confirming === 'all' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">
            <strong>{total}件</strong>すべてを対応済みにします（{filterDescription}）。
            このお客様へのリマインドは止まります。よろしいですか？
          </span>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void runAll()}>
            {busy
              ? progress
                ? `処理中… ${progress.resolved}/${total}件`
                : '処理中…'
              : `はい、${total}件すべて対応済みにする`}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(null)}>
            やめる
          </button>
        </div>
      ) : confirming === 'selected' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">
            選んだ<strong>{selected.length}件</strong>を対応済みにします。リマインドが止まります。よろしいですか？
          </span>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void runSelected()}>
            {busy ? '処理中…' : `はい、${selected.length}件を対応済みにする`}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(null)}>
            やめる
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* 主役。チェックを付けなくてもこれ1回で終わる */}
          {total > 0 ? (
            <button type="button" className="btn-primary" onClick={() => setConfirming('all')}>
              ✅ 未返信 {total}件すべてを対応済みにする
            </button>
          ) : null}

          {/* 補助。一部だけ閉じたいとき用 */}
          {selected.length > 0 ? (
            <>
              <button type="button" className="btn" onClick={() => setConfirming('selected')}>
                選んだ{selected.length}件だけにする
              </button>
              <button type="button" className="btn" onClick={onClear}>
                選択を解除
              </button>
            </>
          ) : null}
        </div>
      )}

      {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}

      <p className="mt-2 text-xs text-slate-500">
        返信していないお客様を対応済みにすると、以後リマインドされません。
        {selected.length === 0 ? '「すべて」はいま絞り込んでいる条件の全件が対象です（表示中のページだけではありません）。' : null}
      </p>
    </div>
  )
}
