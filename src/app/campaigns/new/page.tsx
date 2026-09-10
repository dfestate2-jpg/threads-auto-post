import { AppShell } from '@/components/AppShell'
import { CampaignEditor, DEFAULT_BODY } from '@/components/campaigns/CampaignEditor'
import { requirePageSession } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function NewCampaignPage() {
  await requirePageSession()
  const properties = await prisma.property.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, title: true, area: true, price: true },
  })

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">新しい配信を作成</h1>
      <CampaignEditor
        editable
        properties={properties}
        initial={{
          id: null,
          name: '',
          subject: '{{name}}様へ 新着物件のご案内',
          body: DEFAULT_BODY,
          propertyIds: [],
          segAreas: [],
          segBudgetMin: null,
          segBudgetMax: null,
          segOptedInOnly: true,
          segLineSilentOnly: true,
          segLineSilentDays: 30,
        }}
      />
    </AppShell>
  )
}
