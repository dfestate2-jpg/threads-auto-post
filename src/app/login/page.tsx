import { redirect } from 'next/navigation'

import { readSession } from '@/lib/auth/session'
import { prisma } from '@/lib/prisma'
import { isSetupPending } from '@/lib/services/bootstrap'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

/**
 * ログイン後の戻り先。
 * middleware が付ける ?next= をそのまま信じると外部サイトへ飛ばせてしまうため、
 * 「このサイト内のパス」だけを許可する。
 */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const next = safeNext((await searchParams).next)
  if (await readSession()) redirect(next)

  // 管理者が1人もいない = 初回。ログイン画面で迷わせず初期設定へ送る。
  // redirect() は内部で例外を投げるため、**必ず try の外で呼ぶ**
  // （中で呼ぶと catch に飲まれてリダイレクトしない）。
  let pending = false
  try {
    pending = await isSetupPending(prisma)
  } catch {
    // DBに繋がらない場合はログイン画面をそのまま出す（原因は /setup 側で表示する）
  }
  if (pending) redirect('/setup')

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-bold">公式LINE 未返信リマインド</h1>
        <p className="mb-6 text-sm text-slate-500">管理画面にログイン</p>
        <LoginForm next={next} />
      </div>
    </main>
  )
}
