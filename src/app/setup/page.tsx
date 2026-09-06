import { redirect } from 'next/navigation'

import { prisma } from '@/lib/prisma'
import { isSetupPending } from '@/lib/services/bootstrap'
import { SetupForm } from './SetupForm'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  let pending = true
  let dbError: string | null = null
  try {
    pending = await isSetupPending(prisma)
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  // 既に管理者がいる場合、この画面から増やすことはできない
  if (!dbError && !pending) redirect('/login')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6">
        <h1 className="mb-1 text-lg font-bold">初期設定</h1>
        <p className="mb-6 text-sm text-slate-500">
          最初の管理者アカウントを作成します。この画面は<strong>最初の1回だけ</strong>使えます。
        </p>

        {dbError ? (
          <div className="space-y-2 rounded bg-red-50 px-3 py-3 text-sm text-red-700">
            <p className="font-bold">データベースに接続できませんでした</p>
            <p>
              環境変数 <code className="font-mono">DATABASE_URL</code> と{' '}
              <code className="font-mono">DIRECT_URL</code> の値を確認してください。
              パスワードの貼り間違い、ポート番号（6543 と 5432）の取り違えが多い原因です。
            </p>
            <p className="break-all font-mono text-xs opacity-70">{dbError}</p>
          </div>
        ) : (
          <SetupForm />
        )}
      </div>
    </main>
  )
}
