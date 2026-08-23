import { NextResponse } from 'next/server'

import { UnauthorizedError } from '@/lib/auth/guard'

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as unknown as Record<string, unknown>, { status })
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export function handleApiError(e: unknown): NextResponse {
  if (e instanceof UnauthorizedError) return jsonError(e.message, e.status)
  console.error('[api] unhandled error', e)
  return jsonError('サーバーエラーが発生しました', 500)
}

/**
 * CSRF 対策：状態変更リクエストは同一オリジンからのみ受け付ける。
 * SameSite=Lax Cookie と併用して二重に防ぐ。
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (!origin) return // 同一オリジンのフォーム送信等では付かないことがある
  const host = request.headers.get('host')
  try {
    if (new URL(origin).host !== host) throw new Error('cross-origin')
  } catch {
    throw new UnauthorizedError(403)
  }
}
