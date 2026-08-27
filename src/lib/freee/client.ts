/**
 * freee 会計 Public API のクライアント（必要な参照系だけ）。
 *
 * 銀行の入出金明細は、freee 側の「口座同期（API連携方式）」で取り込まれた結果を
 * **口座明細（wallet_txns）** として読み出す。
 * 本システムは銀行へ直接ログインしないため、銀行のIDやパスワードを一切保持しない。
 */

import { getFreeeAccessToken } from './tokenStore'

const API_BASE = 'https://api.freee.co.jp'
/** freee 推奨のバージョン指定ヘッダ */
const API_VERSION = '2020-06-15'
/** 1リクエストで取れる明細の上限 */
const PAGE_LIMIT = 100
/** 暴走防止。1口座あたりの最大取得件数 */
const MAX_PAGES = 50

export interface FreeeWalletTxn {
  id: number
  company_id: number
  date: string
  amount: number
  due_amount?: number
  balance?: number
  entry_side: 'income' | 'expense'
  walletable_type: string
  walletable_id: number
  /** 銀行から届いた摘要。振込人名義はここに入る */
  description: string
  status?: number
  rule_matched?: boolean
}

export interface FreeeWalletable {
  id: number
  name: string
  bank_id?: number
  type: 'bank_account' | 'credit_card' | 'wallet'
  last_balance?: number
  walletable_balance?: number
}

export interface FreeeCompany {
  id: number
  name: string | null
  display_name: string
  role: string
}

export class FreeeApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string,
  ) {
    super(`freee API ${path} responded ${status}: ${body.slice(0, 300)}`)
    this.name = 'FreeeApiError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * GET リクエスト。429 / 5xx は指数バックオフで再試行する。
 * freee 側の一時的な不調で1回の実行が丸ごと落ちないようにするため。
 */
async function apiGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const url = `${API_BASE}${path}${query.toString() ? `?${query.toString()}` : ''}`

  const backoffMs = [1_000, 3_000, 8_000]
  for (let attempt = 0; ; attempt += 1) {
    const token = await getFreeeAccessToken()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-Api-Version': API_VERSION,
        },
        signal: controller.signal,
      })
      if (res.ok) return (await res.json()) as T

      const body = await res.text()
      const retryable = res.status === 429 || res.status >= 500
      if (retryable && attempt < backoffMs.length) {
        await sleep(backoffMs[attempt] ?? 1_000)
        continue
      }
      throw new FreeeApiError(res.status, path, body)
    } finally {
      clearTimeout(timer)
    }
  }
}

export async function listCompanies(): Promise<FreeeCompany[]> {
  const data = await apiGet<{ companies: FreeeCompany[] }>('/api/1/companies', {})
  return data.companies ?? []
}

export async function listWalletables(companyId: number): Promise<FreeeWalletable[]> {
  const data = await apiGet<{ walletables: FreeeWalletable[] }>('/api/1/walletables', {
    company_id: companyId,
    type: 'bank_account',
  })
  return data.walletables ?? []
}

export interface ListWalletTxnsParams {
  companyId: number
  /** 省略時は事業所の全口座 */
  walletableId?: number
  /** yyyy-MM-dd */
  startDate: string
  /** yyyy-MM-dd */
  endDate: string
}

/**
 * 期間内の **入金（entry_side=income）** の口座明細をすべて取得する。
 * ページングは内側で処理し、呼び出し側は全件を受け取る。
 */
export async function listIncomeWalletTxns(params: ListWalletTxnsParams): Promise<FreeeWalletTxn[]> {
  const all: FreeeWalletTxn[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await apiGet<{ wallet_txns: FreeeWalletTxn[] }>('/api/1/wallet_txns', {
      company_id: params.companyId,
      walletable_type: params.walletableId === undefined ? undefined : 'bank_account',
      walletable_id: params.walletableId,
      start_date: params.startDate,
      end_date: params.endDate,
      entry_side: 'income',
      offset: page * PAGE_LIMIT,
      limit: PAGE_LIMIT,
    })

    const txns = data.wallet_txns ?? []
    all.push(...txns)
    if (txns.length < PAGE_LIMIT) break
  }

  // freee 側の指定が効かない環境でも取りこぼし・混入が起きないよう、受信後にも絞る
  return all.filter((txn) => txn.entry_side === 'income')
}
