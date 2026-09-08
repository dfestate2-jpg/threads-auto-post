import Link from 'next/link'

import { EmptyState, PageHeader, SectionCard } from '@/components/company-os/ui'
import { KIND_LABEL, searchAll, type SearchKind } from '@/lib/services/companyOs/search'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * 横断検索。
 * タスク・課題・決定・会議・プロジェクト・書類・メンバーを1回で探す。
 * 「どこに書いたか」を覚えていなくても辿り着けることが目的。
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireCompanyPage()
  const params = await searchParams
  const query = (params.q ?? '').trim()

  const hits = query ? await searchAll(ctx.company.id, ctx.role, query) : []

  const grouped = new Map<SearchKind, typeof hits>()
  for (const hit of hits) {
    const list = grouped.get(hit.kind) ?? []
    list.push(hit)
    grouped.set(hit.kind, list)
  }

  return (
    <>
      <PageHeader
        title={query ? `「${query}」の検索結果` : '検索'}
        description={query ? `${hits.length}件見つかりました。` : '上部の検索欄から、会社の情報を横断して探せます。'}
      />

      <form action="/company-os/search" className="mb-5" role="search">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="タスク・課題・決定事項・会議・書類・メンバー"
            aria-label="検索語"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button type="submit" className="btn-primary px-4 py-2 text-sm">
            検索
          </button>
        </div>
      </form>

      {!query ? null : hits.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="見つかりませんでした"
          description="別の言葉で試すか、まだ登録されていない可能性があります。"
        />
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([kind, rows]) => (
            <SectionCard key={kind} title={`${KIND_LABEL[kind]}（${rows.length}件）`}>
              <ul className="divide-y divide-slate-100">
                {rows.map((hit) => (
                  <li key={`${hit.kind}-${hit.id}`} className="py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={hit.href} className="text-sm font-medium text-slate-900 hover:underline">
                        {hit.title}
                      </Link>
                      {hit.meta ? <span className="text-xs text-slate-400">{hit.meta}</span> : null}
                    </div>
                    {hit.snippet ? (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{hit.snippet}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}
    </>
  )
}
