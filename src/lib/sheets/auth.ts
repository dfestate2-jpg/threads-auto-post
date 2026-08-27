/**
 * Google サービスアカウントによるアクセストークン取得（JWT Bearer フロー）。
 *
 * googleapis パッケージを足さずに済むよう、Node 標準の crypto だけで署名する。
 * 依存を増やさないことは、この規模のシステムでは保守性に直結する。
 *
 * サービスアカウントは「対象スプレッドシートを共有された1アカウント」であり、
 * 個人の Google アカウントの認可情報を保持しない。
 */

import { createSign } from 'node:crypto'

import { env } from '@/lib/env'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
/** 期限の少し前に取り直す */
const EXPIRY_MARGIN_MS = 60_000

let cached: { token: string; expiresAt: number } | null = null

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 環境変数に入れた秘密鍵の改行を復元する。
 * ホスティングの環境変数UIでは改行が "\n" のまま入ることが多い。
 */
export function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

export async function getSheetsAccessToken(now: Date = new Date()): Promise<string> {
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > now.getTime()) return cached.token

  const issuedAt = Math.floor(now.getTime() / 1000)
  const expiresAt = issuedAt + 3600

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: env.googleServiceAccountEmail,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: expiresAt,
    }),
  )

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  signer.end()
  const signature = base64url(signer.sign(normalizePrivateKey(env.googlePrivateKey)))
  const assertion = `${header}.${claims}.${signature}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Google token endpoint responded ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = (await res.json()) as { access_token: string; expires_in: number }
    cached = { token: data.access_token, expiresAt: now.getTime() + data.expires_in * 1000 }
    return data.access_token
  } finally {
    clearTimeout(timer)
  }
}

/** テスト・トークン失効時のリセット用 */
export function resetSheetsTokenCache(): void {
  cached = null
}
