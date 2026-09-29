'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** ボタンに並べる停止の長さ。営業の現場で実際に言われる区切りだけを置く */
const OPTIONS: { label: string; body: { minutes: number } | { mode: 'end_of_day' } }[] = [
  { label: '1時間', body: { minutes: 60 } },
  { label: '3時間', body: { minutes: 180 } },
  { label: '今日いっぱい', body: { mode: 'end_of_day' } },
  { label: '1日（24時間）', body: { minutes: 24 * 60 } },
]

/**
 * リマインド全体の一時停止。
 *
 * 臨時の打ち合わせ、システム側の調整、LINEの障害など
 * 「今は全員に鳴らしてほしくない」ときのための止め方。
 *
 * **止めている間の通知は消えない。** 営業時間外と同じで繰り延べられ、
 * 再開後の実行でまとめて送られる。だから止めても見逃しにはならない。
 * 逆に言えば、長く止めるほど再開直後の通数が増える。
 *
 * **必ず期限を持たせる。** 無期限に止められると、止めたことを忘れた時点で
 * 「未返信を見逃さない」という仕組みそのものが静かに死ぬ。
 * だから長さは選べても上限は24時間で、再開は常に1タップでできるようにした。
 */
export function PauseCard({
  pausedUntil,
  pauseMinutes,
  timezone,
}: {
  pausedUntil: Date | null
  /** 既定の長さ（分）。この長さのボタンを推奨として目立たせる */
  pauseMinutes: number
  timezone: string
}) {
  const router = useRouter()
  const [until, setUntil] = useState<Date | null>(pausedUntil)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paused = until !== null && until.getTime() > Date.now()

  async function send(body: Record<string, unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const parsed = (await res.json().catch(() => null)) as { error?: string } | null
        setError(parsed?.error ?? '変更できませんでした')
        return
      }
      const data = (await res.json()) as { pausedUntil: string | null }
      setUntil(data.pausedUntil ? new Date(data.pausedUntil) : null)
      router.refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const label = until
    ? new Intl.DateTimeFormat('ja-JP', {
        timeZone: timezone,
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(until)
    : null

  return (
    <section className={`card p-4 ${paused ? 'border-orange-300 bg-orange-50' : ''}`}>
      <h2 className="mb-1 text-sm font-bold">リマインドの一時停止</h2>
      <p className="mb-3 text-xs text-slate-600">
        全員へのリマインドをまとめて止めます。止めている間の通知は<strong>消えずに繰り延べられ</strong>、
        再開後にまとめて送られます。
      </p>

      {paused ? (
        <div className="mb-3 rounded bg-white px-3 py-2 text-sm font-medium text-orange-900">
          ⏸ 停止中です（{label} まで）。この間、未返信があっても誰にも通知されません。
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {OPTIONS.map((o) => {
          const recommended = 'minutes' in o.body && o.body.minutes === pauseMinutes
          return (
            <button
              key={o.label}
              type="button"
              className={recommended && !paused ? 'btn-primary' : 'btn'}
              disabled={busy}
              onClick={() => void send(o.body)}
            >
              ⏸ {o.label}
            </button>
          )
        })}
        {paused ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void send({ minutes: 0 })}>
            ▶ 今すぐ再開
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {paused
          ? '停止中に長さを押すと、押した時点から数え直して期限が引き直されます（延ばすことも縮めることもできます）。'
          : '止められるのは最長24時間までです。休業日など数日単位で止めたいときは、営業日の設定で登録してください。'}
      </p>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  )
}
