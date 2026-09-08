'use client'

/**
 * 画面から API を呼ぶための薄い包み。
 * エラーは必ず日本語の文字列にして返す。画面ごとに握りつぶさないため。
 */
export interface ApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

const BASE = '/api/company-os'

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const payload = text ? (JSON.parse(text) as { error?: string; data?: T }) : {}
    if (!response.ok) {
      return { ok: false, error: payload.error ?? `保存に失敗しました（${response.status}）` }
    }
    return { ok: true, data: payload.data }
  } catch {
    return { ok: false, error: '通信に失敗しました。時間をおいて、もう一度お試しください' }
  }
}

export const api = {
  create: <T>(resource: string, body: unknown) => call<T>('POST', `/${resource}`, body),
  update: <T>(resource: string, id: string, body: unknown) => call<T>('PATCH', `/${resource}/${id}`, body),
  remove: (resource: string, id: string) => call('DELETE', `/${resource}/${id}`),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => call<T>('PATCH', path, body),
  del: (path: string, body?: unknown) => call('DELETE', path, body),
}
