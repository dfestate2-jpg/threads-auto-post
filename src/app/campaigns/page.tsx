import Link from 'next/link'

import { AppShell } from '@/components/AppShell'
import { requirePageSession } from '@/lib/auth/guard'
import { CAMPAIGN_STATUS_CLASS, CAMPAIGN_STATUS_LABEL } from '@/lib/domain/campaignLabels'
import { isMailConfigured } from '@/lib/email/client'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'
import { formatDateTimeJa } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  await requirePageSession()
  const settings = await getSettings()

  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })

  return (
    <AppShell
      alert={
        isMailConfigured()
          ? null
          : '⚠️ メール送信プロバイダ（MAIL_PROVIDER）が未設定です。設定するまで実際の配信は行われません。'
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">物件情報の一斉配信</h1>
        <Link href="/campaigns/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          新しい配信を作成
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="card p-6 text-sm text-slate-500">
          まだ配信がありません。先に
          <Link href="/contacts" className="mx-1 underline">
            配信先リスト
          </Link>
          を取り込んでから作成してください。
        </p>
      ) : (
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2">配信名</th>
                <th className="py-2">状態</th>
                <th className="py-2">対象</th>
                <th className="py-2">送信済</th>
                <th className="py-2">失敗</th>
                <th className="py-2">作成日時</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link href={`/campaigns/${c.id}`} className="font-medium underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-slate-500">{c.subject}</div>
                  </td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${CAMPAIGN_STATUS_CLASS[c.status]}`}>
                      {CAMPAIGN_STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="py-2">{c.totalCount.toLocaleString('ja-JP')}</td>
                  <td className="py-2">{c.sentCount.toLocaleString('ja-JP')}</td>
                  <td className={`py-2 ${c.failedCount > 0 ? 'text-red-700' : ''}`}>
                    {c.failedCount.toLocaleString('ja-JP')}
                  </td>
                  <td className="py-2 text-xs text-slate-500">{formatDateTimeJa(c.createdAt, settings.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
