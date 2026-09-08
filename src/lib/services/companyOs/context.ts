/**
 * Company OS の実行コンテキスト。
 *
 * すべての画面・APIは「どの会社を見ているか」と「その会社での権限」を
 * 必ずここから受け取る。会社の切り替えは Cookie に持つ。
 * 会社IDを画面のクエリで渡す方式にすると、URLを書き換えるだけで
 * 他社のデータに触れられてしまうため採らない。
 */
import { cookies } from 'next/headers'
import type { CoCompany, CoMember, CoRole } from '@prisma/client'

import { requireApiSession, requirePageSession, type Role } from '@/lib/auth/guard'
import type { SessionPayload } from '@/lib/auth/session'
import { fallbackRole } from '@/lib/company-os/access'
import { prisma, withReadRetry } from '@/lib/prisma'

export const COMPANY_COOKIE = 'co_company'

export interface CompanyContext {
  session: SessionPayload
  /** 会社が1社も無いときは null（初期設定画面に誘導する） */
  company: CoCompany | null
  /** 切り替え用の一覧 */
  companies: Pick<CoCompany, 'id' | 'name' | 'stage'>[]
  /** この会社での権限 */
  role: CoRole
  /** 会社メンバーとして登録されていれば、その行 */
  member: CoMember | null
  userName: string
}

async function build(session: SessionPayload): Promise<CompanyContext> {
  const store = await cookies()
  const preferred = store.get(COMPANY_COOKIE)?.value

  const [companies, user] = await withReadRetry(() =>
    Promise.all([
      prisma.coCompany.findMany({
        where: { archived: false },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } }),
    ]),
  )

  // Cookie の会社が消えている／アーカイブされている場合は先頭に戻す
  const company = companies.find((c) => c.id === preferred) ?? companies[0] ?? null

  const member = company
    ? await prisma.coMember.findFirst({
        where: { companyId: company.id, userId: session.userId, active: true },
      })
    : null

  return {
    session,
    company,
    companies: companies.map((c) => ({ id: c.id, name: c.name, stage: c.stage })),
    role: member?.role ?? fallbackRole(session.role),
    member,
    userName: user?.name ?? 'ユーザー',
  }
}

/** 画面（Server Component）用。未ログインならログイン画面へ */
export async function pageContext(): Promise<CompanyContext> {
  return build(await requirePageSession())
}

/** API 用。未認証・権限不足は例外 */
export async function apiContext(minRole: Role = 'STAFF'): Promise<CompanyContext> {
  return build(await requireApiSession(minRole))
}

export class CompanyOsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** 会社が選ばれていることを保証する（API 側の入口で使う） */
export function requireCompany(ctx: CompanyContext): CoCompany {
  if (!ctx.company) throw new CompanyOsError('先に会社を登録してください', 409)
  return ctx.company
}

/** 編集権限。閲覧のみの人が API を直接叩いても書き込めないようにする */
export function requireEditor(ctx: CompanyContext): void {
  if (ctx.role === 'VIEWER') throw new CompanyOsError('この操作を行う権限がありません', 403)
}

export function requireCompanyAdmin(ctx: CompanyContext): void {
  if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
    throw new CompanyOsError('会社情報を変更できるのは管理者だけです', 403)
  }
}
