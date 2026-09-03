import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { FollowUpRuleTable } from '@/components/followup/FollowUpRuleTable'
import { TemplateTable } from '@/components/followup/TemplateTable'
import { requirePageSession } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** 追客ルールとLINEテンプレートの設定。【指示書 9・10】 */
export default async function FollowUpSettingsPage() {
  await requirePageSession()
  const [rules, templates] = await Promise.all([
    prisma.followUpRule.findMany({ orderBy: [{ status: 'asc' }, { step: 'asc' }] }),
    prisma.messageTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }] }),
  ])

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">追客ルール・LINEテンプレート</h1>
        <Link href="/settings" className="text-sm text-slate-600 hover:underline">
          ← 通知の設定へ
        </Link>
      </div>

      <p className="mb-4 text-sm text-slate-600">
        ステータスごとに「何日後に何をするか」を並べたものが自動追客ルールです。
        顧客のステータスが変わった時刻を起点に、次回アクションが自動で決まります。
      </p>

      <h2 className="mb-2 mt-6 text-sm font-bold">自動追客ルール</h2>
      <FollowUpRuleTable rules={rules} />

      <h2 className="mb-2 mt-8 text-sm font-bold">LINEテンプレート</h2>
      <TemplateTable templates={templates} />
    </AppShell>
  )
}
