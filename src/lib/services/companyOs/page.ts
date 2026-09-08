/**
 * 画面側の共通の入口。
 *
 * 会社が未登録のまま各画面を開くと、どの画面でも「会社が無い」の分岐を
 * 書くことになる。ここで初期設定へ送ってしまい、以降の画面は
 * 「会社は必ずある」前提で書けるようにする。
 */
import { redirect } from 'next/navigation'
import type { CoCompany } from '@prisma/client'

import { pageContext, type CompanyContext } from './context'

export interface ReadyContext extends CompanyContext {
  company: CoCompany
}

export async function requireCompanyPage(): Promise<ReadyContext> {
  const ctx = await pageContext()
  if (!ctx.company) redirect('/company-os/setup')
  return ctx as ReadyContext
}
