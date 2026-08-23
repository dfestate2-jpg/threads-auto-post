'use client'

import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      className="text-sm text-slate-500 hover:text-slate-900"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        router.replace('/login')
        router.refresh()
      }}
    >
      ログアウト
    </button>
  )
}
