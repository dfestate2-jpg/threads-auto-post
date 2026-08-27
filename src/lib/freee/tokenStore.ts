/**
 * freee の OAuth トークン管理。
 *
 * freee のリフレッシュトークンは **1回使うと新しい値に置き換わる（ローテーション）**。
 * 環境変数に置いたままにすると、1度更新した時点で環境変数の値は無効になり、
 * 次のデプロイやコンテナ再起動で認証が壊れる。
 * そのためトークンはDB（integration_credentials）に保存し、更新は必ず排他制御下で行う。
 *
 * 排他制御を怠って2つの実行が同時に更新すると、
 * 片方の更新でもう片方のリフレッシュトークンが無効化され、再認可が必要になる。
 * → PostgreSQL のトランザクション内アドバイザリロックで直列化する。
 */

import { createHash } from 'node:crypto'

import type { Prisma } from '@prisma/client'

import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

const PROVIDER = 'freee'
const TOKEN_ENDPOINT = 'https://accounts.secure.freee.co.jp/public_api/token'
export const AUTHORIZE_ENDPOINT = 'https://accounts.secure.freee.co.jp/public_api/authorize'
/** 認可コードを画面に表示させる（Webサーバ不要）ための固定リダイレクトURI */
export const OOB_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'

/** 期限ぎりぎりのトークンは使わない（時計ずれ・処理時間の余裕） */
const EXPIRY_MARGIN_MS = 5 * 60_000
/** freee トークン更新用のアドバイザリロックキー（他の用途と衝突しない任意の定数） */
const TOKEN_LOCK_KEY = 810_100_1

/**
 * プロセス内キャッシュ。
 * API呼び出しのたびにトランザクション＋ロックを取りに行かないための短絡路。
 * 正はあくまでDBで、ここは同じ実行の中で使い回すだけ。
 */
let inProcess: { token: string; expiresAt: number } | null = null

/** 再認可（ブラウザでの認可操作）が必要になったことを表す */
export class FreeeReauthorizationRequiredError extends Error {
  constructor(message: string) {
    super(`freee の再認可が必要です: ${message}`)
    this.name = 'FreeeReauthorizationRequiredError'
  }
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
}

/** 生のトークンは保存しないため、比較用の指紋だけを持つ */
function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      // invalid_grant = リフレッシュトークンが失効/使用済み。人の再認可が要る
      if (res.status === 400 && text.includes('invalid_grant')) {
        throw new FreeeReauthorizationRequiredError('リフレッシュトークンが失効しています')
      }
      throw new Error(`freee token endpoint responded ${res.status}`)
    }
    return JSON.parse(text) as TokenResponse
  } finally {
    clearTimeout(timer)
  }
}

/** 初回だけ、環境変数のリフレッシュトークンをDBへ取り込む */
async function ensureCredential(tx: Prisma.TransactionClient) {
  const existing = await tx.integrationCredential.findUnique({ where: { provider: PROVIDER } })
  const seed = env.freeeRefreshTokenSeed

  if (!existing) {
    if (!seed) {
      throw new FreeeReauthorizationRequiredError(
        'FREEE_REFRESH_TOKEN が未設定です。scripts/freee-authorize.ts で取得してください',
      )
    }
    return tx.integrationCredential.create({
      data: { provider: PROVIDER, refreshToken: seed, seedFingerprint: fingerprint(seed) },
    })
  }

  // 環境変数に「新しい」リフレッシュトークンが入ったときだけDBを上書きする。
  // （ローテーション後はDBの値と環境変数の値が食い違うのが正常なので、
  //   指紋が変わったかどうかで「人が入れ直したか」を判定する）
  if (seed && fingerprint(seed) !== existing.seedFingerprint) {
    return tx.integrationCredential.update({
      where: { provider: PROVIDER },
      data: {
        refreshToken: seed,
        seedFingerprint: fingerprint(seed),
        accessToken: null,
        accessTokenExpiresAt: null,
        failureCount: 0,
        lastError: null,
      },
    })
  }

  return existing
}

/**
 * 有効なアクセストークンを返す。期限が近ければ更新する。
 * 更新はアドバイザリロックで直列化されるため、Cron が多重起動しても
 * リフレッシュトークンが二重に消費されることはない。
 */
export async function getFreeeAccessToken(now: Date = new Date()): Promise<string> {
  if (inProcess && inProcess.expiresAt - EXPIRY_MARGIN_MS > now.getTime()) return inProcess.token

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TOKEN_LOCK_KEY}::bigint)`

      const credential = await ensureCredential(tx)

      const stillValid =
        credential.accessToken &&
        credential.accessTokenExpiresAt &&
        credential.accessTokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > now.getTime()
      if (stillValid && credential.accessToken && credential.accessTokenExpiresAt) {
        inProcess = { token: credential.accessToken, expiresAt: credential.accessTokenExpiresAt.getTime() }
        return credential.accessToken
      }

      try {
        const token = await requestToken({
          grant_type: 'refresh_token',
          client_id: env.freeeClientId,
          client_secret: env.freeeClientSecret,
          refresh_token: credential.refreshToken,
        })

        await tx.integrationCredential.update({
          where: { provider: PROVIDER },
          data: {
            accessToken: token.access_token,
            accessTokenExpiresAt: new Date(now.getTime() + token.expires_in * 1000),
            refreshToken: token.refresh_token,
            failureCount: 0,
            lastError: null,
          },
        })
        inProcess = { token: token.access_token, expiresAt: now.getTime() + token.expires_in * 1000 }
        return token.access_token
      } catch (e) {
        inProcess = null
        const message = e instanceof Error ? e.message : String(e)
        await tx.integrationCredential.update({
          where: { provider: PROVIDER },
          data: { failureCount: { increment: 1 }, lastError: message.slice(0, 500) },
        })
        throw e
      }
    },
    { timeout: 30_000, maxWait: 15_000 },
  )
}

/** 認可コード（初回のみ）をトークンに交換する。scripts/freee-authorize.ts から使う */
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string = OOB_REDIRECT_URI,
): Promise<TokenResponse> {
  return requestToken({
    grant_type: 'authorization_code',
    client_id: env.freeeClientId,
    client_secret: env.freeeClientSecret,
    code,
    redirect_uri: redirectUri,
  })
}

/** ブラウザで開く認可URL */
export function buildAuthorizeUrl(redirectUri: string = OOB_REDIRECT_URI): string {
  const params = new URLSearchParams({
    client_id: env.freeeClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    prompt: 'select_company',
  })
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`
}

/** テスト・トークン失効時のリセット用 */
export function resetFreeeTokenCache(): void {
  inProcess = null
}
