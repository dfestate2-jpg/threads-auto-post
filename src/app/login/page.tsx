import { redirect } from 'next/navigation'

import { readSession } from '@/lib/auth/session'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await readSession()) redirect('/')
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-bold">公式LINE 未返信リマインド</h1>
        <p className="mb-6 text-sm text-slate-500">管理画面にログイン</p>
        <LoginForm />
      </div>
    </main>
  )
}
