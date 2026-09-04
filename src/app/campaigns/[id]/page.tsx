import { CampaignStatus } from '@prisma/client'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { AutoRefresh } from '@/components/AutoRefresh'
import { CampaignControls } from '@/components/campaigns/CampaignControls'
import { CampaignEditor } from '@/components/campaigns/CampaignEditor'
import { StatCard } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { CAMPAIGN_STATUS_LABEL } from '@/lib/domain/campaignLabels'
import { getCampaignProgress, segmentOf } from '@/lib/services/campaign'
import { describeSegment } from '@/lib/services/segment'

export const dynamic = 'force-dynamic'

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession()
  const { id } = await params

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { properties: { orderBy: { position: 'asc' }, select: { propertyId: true } } },
  })
  if (!campaign) notFound()

  const [properties, progress] = await Promise.all([
    prisma.property.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, title: true, area: true, price: true },
    }),
    getCampaignProgress(id),
  ])

  const editable = campaign.status === CampaignStatus.DRAFT
  const running = campaign.status === CampaignStatus.QUEUED || campaign.status === CampaignStatus.SENDING
  const remaining = progress.pending

  return (
    <AppShell>
      {running ? <AutoRefresh seconds={15} /> : null}

      <div className="mb-4 flex items-center gap-3">
        <Link href="/campaigns" className="text-sm text-slate-500 underline">
          配信一覧
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold">{campaign.name || '(名称未設定)'}</h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {CAMPAIGN_STATUS_LABEL[campaign.status]}
        </span>
      </div>

      {!editable ? (
        <section className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="対象" value={progress.total} />
            <StatCard label="送信済" value={progress.sent} tone="ok" />
            <StatCard label="送信待ち" value={remaining} tone={remaining > 0 ? 'warn' : 'neutral'} />
            <StatCard
              label="失敗"
              value={progress.failed}
              tone={progress.failed > 0 ? 'danger' : 'neutral'}
              hint={progress.skipped > 0 ? `配信停止によるスキップ ${progress.skipped}件` : undefined}
            />
          </div>

          {running ? (
            <div className="card p-4">
              <p className="mb-2 text-xs text-slate-600">
                1分ごとの定期実行で順次送信しています。この画面は自動で更新されます。
              </p>
              <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
                <div
                  className="h-full bg-slate-900 transition-all"
                  style={{
                    width: `${progress.total === 0 ? 0 : Math.round(((progress.total - remaining) / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          <CampaignControls campaignId={campaign.id} status={campaign.status} />

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold">配信条件</h2>
            <ul className="list-inside list-disc text-xs text-slate-600">
              {describeSegment(segmentOf(campaign)).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <CampaignEditor
        editable={editable}
        properties={properties}
        initial={{
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          body: campaign.body,
          propertyIds: campaign.properties.map((p) => p.propertyId),
          segAreas: campaign.segAreas,
          segBudgetMin: campaign.segBudgetMin,
          segBudgetMax: campaign.segBudgetMax,
          segOptedInOnly: campaign.segOptedInOnly,
          segLineSilentOnly: campaign.segLineSilentOnly,
          segLineSilentDays: campaign.segLineSilentDays,
        }}
      />
    </AppShell>
  )
}
