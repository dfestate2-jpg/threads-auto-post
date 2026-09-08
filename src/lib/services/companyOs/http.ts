/**
 * Company OS の API 共通処理。
 *
 * 検証エラーは 400 で「どの項目がなぜ駄目か」を日本語で返す。
 * 画面側はその文字列をそのまま出せばよく、二重に文言を持たなくて済む。
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { handleApiError, jsonError } from '@/lib/http'
import { CompanyOsError } from './context'

export function coError(e: unknown): NextResponse {
  if (e instanceof CompanyOsError) return jsonError(e.message, e.status)
  if (e instanceof z.ZodError) {
    const first = e.errors[0]
    const message = first?.message ?? '入力内容を確認してください'
    return jsonError(message, 400, { issues: e.errors.map((i) => ({ path: i.path.join('.'), message: i.message })) })
  }
  return handleApiError(e)
}

/** BigInt は JSON.stringify で例外になる。API に出す前に文字列へ落とす */
export function jsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as unknown
}
