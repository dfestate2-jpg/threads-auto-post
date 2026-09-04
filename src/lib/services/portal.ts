/**
 * 業務システムポータルのデータ操作。
 *
 * 画面（Server Component）と API の両方から呼ぶため、
 * 入力の正規化と検証はすべてここを通す。
 * こうしておけば「管理画面からは弾かれるが API からは通る」という穴ができない。
 */
import { Prisma, PrismaClient, type PortalSystem, type UserRole } from '@prisma/client'
import { z } from 'zod'

import {
  DEFAULT_ACCENT,
  DEFAULT_ICON,
  assignSortOrders,
  canAccess,
  nextSortOrder,
  normalizeAccent,
  normalizeIcon,
  normalizeName,
  normalizeSystemUrl,
  type PortalRole,
} from '@/lib/domain/portal'
import { prisma } from '@/lib/prisma'

type Db = PrismaClient | Prisma.TransactionClient

export class PortalInputError extends Error {}

/**
 * API が受け取る形。ルートファイルは Next.js が export を検査するため、
 * 共有したいスキーマはここに置く。
 */
export const systemSchema = z.object({
  name: z.string().min(1).max(40),
  url: z.string().min(1).max(500),
  description: z.string().max(120).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  accent: z.string().max(20).nullable().optional(),
  openInNewTab: z.boolean().optional(),
  published: z.boolean().optional(),
  minRole: z.enum(['STAFF', 'MANAGER', 'ADMIN']).optional(),
})

export interface SystemInput {
  name: string
  url: string
  description?: string | null
  icon?: string | null
  accent?: string | null
  openInNewTab?: boolean
  published?: boolean
  minRole?: string
}

const ROLES: PortalRole[] = ['STAFF', 'MANAGER', 'ADMIN']

/** 画面・API から受け取った値を、保存してよい形に整える */
function sanitize(input: SystemInput): {
  name: string
  url: string
  description: string | null
  icon: string
  accent: string
  openInNewTab: boolean
  published: boolean
  minRole: UserRole
} {
  const name = normalizeName(input.name ?? '')
  if (!name) throw new PortalInputError('システム名を1〜40文字で入力してください')

  const url = normalizeSystemUrl(input.url ?? '')
  if (!url) {
    throw new PortalInputError('URLは https://〜 の形式か、このサイト内のパス（/ で始まる）で入力してください')
  }

  const description = (input.description ?? '').trim().slice(0, 120) || null
  const minRole = (ROLES.includes(input.minRole as PortalRole) ? input.minRole : 'STAFF') as UserRole

  return {
    name,
    url,
    description,
    icon: normalizeIcon(input.icon),
    accent: normalizeAccent(input.accent),
    // 外部システムは別タブ、サイト内リンクは同じタブが自然な既定値
    openInNewTab: input.openInNewTab ?? !url.startsWith('/'),
    published: input.published ?? true,
    minRole,
  }
}

const ORDER: Prisma.PortalSystemOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }]

/** 管理画面用。非公開のものも含めて全件 */
export async function listAllSystems(db: Db = prisma): Promise<PortalSystem[]> {
  return db.portalSystem.findMany({ orderBy: ORDER })
}

/**
 * トップページ用。公開中かつ、その人の権限で開けるものだけ。
 * 権限の絞り込みを画面側でやると、増えたページで書き漏らすのでここに閉じ込める。
 */
export async function listVisibleSystems(role: PortalRole, db: Db = prisma): Promise<PortalSystem[]> {
  const rows = await db.portalSystem.findMany({ where: { published: true }, orderBy: ORDER })
  return rows.filter((r) => canAccess(role, r.minRole as PortalRole))
}

export async function createSystem(input: SystemInput, db: Db = prisma): Promise<PortalSystem> {
  const data = sanitize(input)
  const existing = await db.portalSystem.findMany({ select: { sortOrder: true } })
  return db.portalSystem.create({
    data: { ...data, sortOrder: nextSortOrder(existing.map((e) => e.sortOrder)) },
  })
}

export async function updateSystem(id: string, input: SystemInput, db: Db = prisma): Promise<PortalSystem> {
  return db.portalSystem.update({ where: { id }, data: sanitize(input) })
}

/** 公開/非公開だけを切り替える。一覧から1タップで使うため専用にしてある */
export async function setPublished(id: string, published: boolean, db: Db = prisma): Promise<PortalSystem> {
  return db.portalSystem.update({ where: { id }, data: { published } })
}

export async function deleteSystem(id: string, db: Db = prisma): Promise<void> {
  await db.portalSystem.delete({ where: { id } })
}

/**
 * 表示順の振り直し。受け取った id の並びをそのまま 0,10,20... に割り当てる。
 * 一部だけ更新すると順序が壊れるので、必ず全件をまとめて1トランザクションで書く。
 */
export async function reorderSystems(ids: string[], db: Db = prisma): Promise<void> {
  const orders = assignSortOrders(ids.length)
  await Promise.all(
    ids.map((id, i) => db.portalSystem.update({ where: { id }, data: { sortOrder: orders[i] ?? i * 10 } })),
  )
}

/**
 * 初期データ。1件でも登録済みなら何もしない。
 *
 * 実在するものだけを入れる方針にしている。まだ無いシステムの行を
 * ダミーURLで作っておくと、押した人が「壊れている」と受け取ってしまうため。
 * 顧客管理や営業ダッシュボードは、URLが決まった時点で管理画面から足す。
 */
export async function seedDefaultSystems(db: Db = prisma): Promise<number> {
  if ((await db.portalSystem.count()) > 0) return 0
  const defaults: (SystemInput & { sortOrder: number })[] = [
    {
      name: '追客管理',
      description: '今日やるべき営業と、自動追客の進捗',
      icon: '🎯',
      accent: 'blue',
      url: '/',
      openInNewTab: false,
      published: true,
      sortOrder: 0,
    },
    {
      name: 'リマインドシステム',
      description: '公式LINEの未返信を検知して社内へリマインド',
      icon: '🔔',
      accent: 'emerald',
      url: '/reminders',
      openInNewTab: false,
      published: true,
      sortOrder: 10,
    },
  ]
  for (const d of defaults) {
    const { sortOrder, ...rest } = d
    await db.portalSystem.create({ data: { ...sanitize(rest), sortOrder } })
  }
  return defaults.length
}
