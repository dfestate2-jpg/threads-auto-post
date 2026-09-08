/**
 * Company OS の権限判定。
 *
 * ログインの仕組み（既存の User / UserRole）はそのまま使い、
 * 「この会社の中でその人が何をしてよいか」だけをここで決める。
 * DB も Next.js も持ち込まない純粋な関数にしてあるのは、
 * 権限まわりは目視ではなくテストで固定したいため。
 */
import type { CoRole, CoVisibility, UserRole } from '@prisma/client'

/** 数値が大きいほど強い */
export const CO_ROLE_RANK: Record<CoRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  MANAGER: 3,
  ADMIN: 4,
  OWNER: 5,
}

export function atLeast(role: CoRole, minRole: CoRole): boolean {
  return CO_ROLE_RANK[role] >= CO_ROLE_RANK[minRole]
}

/**
 * 会社のメンバーとして未登録の人が Company OS を開いたときの既定の権限。
 * ログインアカウントの役割から引き継ぐ。
 * 「登録されていない＝何も見えない」にすると、導入初日に誰も入れなくなる。
 */
export function fallbackRole(userRole: UserRole): CoRole {
  if (userRole === 'ADMIN') return 'ADMIN'
  if (userRole === 'MANAGER') return 'MANAGER'
  return 'MEMBER'
}

/** 閲覧のみの人には、作成・編集・削除のボタンを出さない */
export function canEdit(role: CoRole): boolean {
  return atLeast(role, 'MEMBER')
}

/** 会社情報・メンバー・株主のような「会社の骨格」を触れるか */
export function canManageCompany(role: CoRole): boolean {
  return atLeast(role, 'ADMIN')
}

/**
 * 公開範囲。経営者だけが見るべき情報（役員報酬の議事録など）を、
 * 一覧の時点で落とすために使う。
 */
export function canSee(role: CoRole, visibility: CoVisibility): boolean {
  if (visibility === 'ALL') return true
  if (visibility === 'MANAGERS') return atLeast(role, 'MANAGER')
  return atLeast(role, 'ADMIN')
}

/** Prisma の where にそのまま渡せる公開範囲の条件 */
export function visibilityFilter(role: CoRole): { visibility: { in: CoVisibility[] } } {
  const all: CoVisibility[] = ['ALL', 'MANAGERS', 'OWNERS']
  return { visibility: { in: all.filter((v) => canSee(role, v)) } }
}
