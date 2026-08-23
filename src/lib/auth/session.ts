import crypto from 'node:crypto'
import { cookies } from 'next/headers'

import { env } from '@/lib/env'
import { SESSION_COOKIE } from './cookie'

export { SESSION_COOKIE }
const MAX_AGE_SECONDS = 60 * 60 * 12

export interface SessionPayload {
  userId: string
  role: 'ADMIN' | 'MANAGER' | 'STAFF'
  staffId: string | null
  /** 有効期限（epoch 秒） */
  exp: number
}

function sign(value: string): string {
  return crypto.createHmac('sha256', env.sessionSecret).update(value).digest('base64url')
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = sign(body)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function buildSessionPayload(user: {
  id: string
  role: 'ADMIN' | 'MANAGER' | 'STAFF'
  staffId: string | null
}): SessionPayload {
  return {
    userId: user.id,
    role: user.role,
    staffId: user.staffId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, encodeSession(payload), {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  return decodeSession(store.get(SESSION_COOKIE)?.value)
}
