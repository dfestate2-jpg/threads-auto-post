'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** 一覧・ダッシュボードを定期的に再取得して、見落としを減らす */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
