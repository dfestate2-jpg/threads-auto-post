/**
 * freee の初回認可（1回だけ人が行う作業）。
 *
 *   npx tsx scripts/freee-authorize.ts
 *
 * 1. 表示されたURLをブラウザで開き、対象の事業所を選んで「許可する」を押す
 * 2. 画面に出た認可コードを貼り付ける
 * 3. 表示された FREEE_REFRESH_TOKEN / FREEE_COMPANY_ID / FREEE_WALLETABLE_IDS を
 *    本番の環境変数に設定する
 *
 * 認可コードは1回しか使えない。失敗したらもう一度この手順をやり直すこと。
 */

import './loadEnv'

import { createInterface } from 'node:readline/promises'

const TOKEN_ENDPOINT = 'https://accounts.secure.freee.co.jp/public_api/token'
const AUTHORIZE_ENDPOINT = 'https://accounts.secure.freee.co.jp/public_api/authorize'
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'
const API_BASE = 'https://api.freee.co.jp'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    console.error(`環境変数 ${name} が設定されていません（freee アプリストア > 開発者向け で発行します）`)
    process.exit(1)
  }
  return value.trim()
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'X-Api-Version': '2020-06-15',
    },
  })
  if (!res.ok) throw new Error(`${path} responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

async function main(): Promise<void> {
  const clientId = requireEnv('FREEE_CLIENT_ID')
  const clientSecret = requireEnv('FREEE_CLIENT_SECRET')

  const authorizeUrl =
    `${AUTHORIZE_ENDPOINT}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      prompt: 'select_company',
    }).toString()

  console.log('\n1) 次のURLをブラウザで開き、対象の事業所を選んで「許可する」を押してください:\n')
  console.log(authorizeUrl)
  console.log('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const code = (await rl.question('2) 画面に表示された認可コードを貼り付けてください: ')).trim()
  rl.close()

  if (code.length === 0) {
    console.error('認可コードが空です')
    process.exit(1)
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  })
  if (!res.ok) {
    console.error(`トークン取得に失敗しました: ${res.status} ${(await res.text()).slice(0, 300)}`)
    process.exit(1)
  }
  const token = (await res.json()) as { access_token: string; refresh_token: string }

  const companies = await apiGet<{ companies: Array<{ id: number; display_name: string }> }>(
    '/api/1/companies',
    token.access_token,
  )

  console.log('\n=== 環境変数に設定する値 ===\n')
  console.log(`FREEE_REFRESH_TOKEN="${token.refresh_token}"`)
  console.log('')
  console.log('事業所の一覧:')
  for (const company of companies.companies ?? []) {
    console.log(`  FREEE_COMPANY_ID=${company.id}   (${company.display_name})`)
  }

  for (const company of companies.companies ?? []) {
    try {
      const walletables = await apiGet<{
        walletables: Array<{ id: number; name: string; type: string }>
      }>(`/api/1/walletables?company_id=${company.id}&type=bank_account`, token.access_token)
      const accounts = walletables.walletables ?? []
      if (accounts.length === 0) continue
      console.log(`\n事業所 ${company.id}（${company.display_name}）の銀行口座:`)
      for (const account of accounts) {
        console.log(`  id=${account.id}  ${account.name}`)
      }
      console.log(`  → 特定の口座だけを対象にするなら:`)
      console.log(`     FREEE_WALLETABLE_IDS="${accounts.map((a) => a.id).join(',')}"（不要な口座は削る）`)
    } catch (e) {
      console.log(`\n事業所 ${company.id} の口座一覧を取得できませんでした: ${String(e)}`)
    }
  }

  console.log('\n注意: リフレッシュトークンは1回使うと新しい値に置き換わります。')
  console.log('      本システムはDBに保存して自動更新するため、環境変数へ入れるのはこの初回の値だけです。')
  console.log('      この出力はパスワードと同等の秘密情報です。チャットやIssueに貼らないでください。\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
