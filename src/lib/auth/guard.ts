import { redirect } from 'next/navigation'

import { readSession, type SessionPayload } from './session'

export class UnauthorizedError extends Error {
  constructor(readonly status: 401 | 403 = 401) {
    super(status === 401 ? '認証が必要です' : '権限がありません')
  }
}

const ROLE_RANK = { STAFF: 1, MANAGER: 2, ADMIN: 3 } as const
export type Role = keyof typeof ROLE_RANK

/** ページ（Server Component）用。未認証ならログイン画面へ */
export async function requirePageSession(): Promise<SessionPayload> {
  const session = await readSession()
  if (!session) redirect('/login')
  return session
}

/** API 用。未認証・権限不足は例外にする */
export async function requireApiSession(minRole: Role = 'STAFF'): Promise<SessionPayload> {
  const session = await readSession()
  if (!session) throw new UnauthorizedError(401)
  if (ROLE_RANK[session.role] < ROLE_RANK[minRole]) throw new UnauthorizedError(403)
  return session
}

export function hasRole(session: SessionPayload, minRole: Role): boolean {
  return ROLE_RANK[session.role] >= ROLE_RANK[minRole]
}
