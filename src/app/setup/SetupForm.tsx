'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SetupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? '初期設定に失敗しました')
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('通信に失敗しました。しばらく待って再度お試しください')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          お名前
        </label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="email">
          メールアドレス（ログインに使います）
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          パスワード
        </label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-slate-500">10文字以上で、英字と数字の両方を含めてください。</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          パスワード（確認）
        </label>
        <input
          id="confirm"
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button className="btn-primary w-full" type="submit" disabled={busy}>
        {busy ? '作成中…' : '管理者アカウントを作成する'}
      </button>
      <p className="text-xs text-slate-500">
        作成すると、営業時間・エスカレーション・祝日の初期値もあわせて登録され、そのままログインした状態になります。
      </p>
    </form>
  )
}
