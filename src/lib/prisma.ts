import { PrismaClient } from '@prisma/client'

/**
 * サーバーレス環境での「一時的な接続切れ」への対処。
 *
 * Netlify Functions のインスタンスは、しばらく呼ばれないと凍結される。
 * 解凍されたときには Supabase のプーラー側が既に接続を閉じているため、
 * **その最初のクエリだけ**が `Connection closed.` で失敗する。
 * 画面を開き直すと直るのはこのためで、アプリの不具合ではない。
 *
 * 判定を関数に切り出してテストできるようにしている。
 */
const TRANSIENT_ERROR_CODES = new Set([
  'P1001', // データベースに到達できない
  'P1002', // 接続がタイムアウトした
  'P1008', // 操作がタイムアウトした
  'P1017', // サーバーが接続を閉じた
  'P2024', // 接続プールから接続を取得できなかった
])

const TRANSIENT_MESSAGE_PATTERNS = [
  /connection closed/i,
  /server has closed the connection/i,
  /connection terminated/i,
  /can't reach database server/i,
  /timed out fetching a new connection/i,
  /econnreset/i,
  /socket hang ?up/i,
]

/** 再試行して意味のある（＝一時的な接続の問題による）エラーかどうか */
export function isTransientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)) return true

  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return false
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

const RETRY_DELAYS_MS = [120, 400]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 一時的な接続エラーだけを対象に再試行する。
 *
 * 画面の描画に必要な読み込みをまとめて包む使い方を想定している。
 * 利用者が「もう一度試す」を押すのと同じことを、待たせずに自動で行う。
 *
 * **読み取り専用の処理にのみ使うこと。**
 * `Connection closed` は「サーバーに届く前に切れた」のか
 * 「保存された直後に切れた」のか区別できず、書き込みを再試行すると
 * 二重登録・二重送信になりうる。
 */
export async function withReadRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransientConnectionError(error)) throw error
      console.warn('[prisma] 一時的な接続エラーを検知したため再試行します', {
        attempt: attempt + 1,
        message: error instanceof Error ? error.message : String(error),
      })
      await sleep(RETRY_DELAYS_MS[attempt] as number)
    }
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
