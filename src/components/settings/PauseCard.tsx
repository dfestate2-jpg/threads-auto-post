'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * リマインド全体の一時停止。
 *
 * 臨時の打ち合わせ、システム側の調整、LINEの障害など
 * 「今は全員に鳴らしてほしくない」ときのための止め方。
 *
 * **止めている間の通知は消えない。** 営業時間外と同じで繰り延べられ、
 * 再開後の実行でまとめて送られる。だから止めても見逃しにはならない。
 *
 * **必ず期限を持たせる。** 無期限に止められると、止めたことを忘れた時点で
 * 「未返信を見逃さない」という仕組みそのものが静かに死ぬ。
 * だから「止める」は押すたびに期限を延ばす形にし、再開は常に1タップでできるようにした。
 */
export function PauseCard({
  pausedUntil,
  pauseMinutes,
  timezone,
}: {
  pausedUntil: Date | null
  /** 1回押したときに止める長さ（分） */
  pauseMinutes: number
  timezone: string
}) {
  const router = useRouter()
  const [until, setUntil] = useState<Date | null>(pausedUntil)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paused = until !== null && until.getTime() > Date.now()

  async function send(minutes: number): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? '変更できませんでした')
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

  const hours = Math.floor(pauseMinutes / 60)
  const rest = pauseMinutes % 60
  const lengthLabel = hours > 0 ? `${hours}時間${rest > 0 ? `${rest}分` : ''}` : `${pauseMinutes}分`

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
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void send(pauseMinutes)}
        >
          {paused ? `⏸ さらに${lengthLabel}延ばす` : `⏸ ${lengthLabel}止める`}
        </button>
        {paused ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void send(0)}>
            ▶ 今すぐ再開
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  )
}
