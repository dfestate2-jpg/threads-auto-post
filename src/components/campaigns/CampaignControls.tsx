'use client'

import type { CampaignStatus } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** 送信中の配信を止める・再開する。誤爆に気づいた瞬間に押せる位置に置く */
export function CampaignControls({ campaignId, status }: { campaignId: string; status: CampaignStatus }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canPause = status === 'QUEUED' || status === 'SENDING'
  const canResume = status === 'PAUSED'
  if (!canPause && !canResume) return null

  async function run(action: 'pause' | 'resume') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '操作に失敗しました')
        return
      }
      setNote(data.note ?? null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-2 p-4">
      {canPause ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('pause')}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          送信を一時停止する
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('resume')}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          送信を再開する
        </button>
      )}
      {note ? <p className="text-xs text-slate-600">{note}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  )
}
