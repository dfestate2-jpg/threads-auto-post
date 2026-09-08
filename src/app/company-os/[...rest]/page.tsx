import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Card, PageHeader, SectionCard } from '@/components/company-os/ui'
import { NAV_GROUPS, NAV_ROOT } from '@/lib/company-os/nav'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * これから作る画面の受け皿。
 *
 * サイドバーには経営に必要な領域をすべて並べている。押した先が
 * 「404」だと壊れているように見えるので、何をいつ作るのかと、
 * いま代わりに使える画面を必ず案内する。
 */
export default async function ComingSoonPage({ params }: { params: Promise<{ rest: string[] }> }) {
  await requireCompanyPage()
  const { rest } = await params
  const pathname = `${NAV_ROOT}/${rest.join('/')}`

  const group = NAV_GROUPS.find((g) => g.items.some((item) => item.href.split('?')[0] === pathname))
  const item = group?.items.find((i) => i.href.split('?')[0] === pathname)

  // メニューに無いパスは、単に存在しないURL
  if (!group || !item) notFound()

  const readyInGroup = group.items.filter((i) => i.ready)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={item.label} description={`${group.icon} ${group.label}`} />

      <Card className="p-6 text-center">
        <p className="text-3xl" aria-hidden>
          🚧
        </p>
        <p className="mt-3 text-sm font-bold text-slate-900">この画面は Phase{item.phase} で作ります</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {item.phase === 2
            ? 'Phase1（タスク・プロジェクト・課題・意思決定・未決事項・会議・会社情報・検索）を先に完成させています。データ構造は先に用意してあるため、画面を足すだけで使えるようになります。'
            : 'AIによる自動生成・議事録解析・外部サービス連携は Phase3 の予定です。'}
        </p>
      </Card>

      {readyInGroup.length > 0 ? (
        <SectionCard className="mt-4" title="いま使える画面">
          <ul className="space-y-1">
            {readyInGroup.map((ready) => (
              <li key={ready.href}>
                <Link href={ready.href} className="text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900">
                  {ready.label}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard className="mt-4" title="この領域を今すぐ管理するには">
        <p className="text-sm leading-relaxed text-slate-600">
          専用の画面ができるまでは、
          <Link href={`${NAV_ROOT}/tasks`} className="mx-1 underline underline-offset-2">
            タスク
          </Link>
          と
          <Link href={`${NAV_ROOT}/projects`} className="mx-1 underline underline-offset-2">
            プロジェクト
          </Link>
          でこの領域の仕事を管理できます。タスクのカテゴリーを「{group.label}」に合わせておくと、
          専用画面ができたときにそのまま引き継げます。
        </p>
      </SectionCard>
    </div>
  )
}
