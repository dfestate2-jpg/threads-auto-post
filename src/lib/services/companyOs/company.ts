/**
 * 会社そのもの（会社情報・メンバー・株主・重要書類）。
 *
 * 会社は複数持てる。買収した会社を別レコードとして並べ、
 * 画面上部で切り替えて経営できるようにするため。
 */
import { Prisma } from '@prisma/client'
import type { CoRole } from '@prisma/client'
import { z } from 'zod'

import { visibilityFilter } from '@/lib/company-os/access'
import { prisma } from '@/lib/prisma'
import { dateField, idRef, optionalText, requiredText } from './input'

const AREA = z.enum([
  'COMPANY', 'LEGAL', 'MANAGEMENT', 'BUSINESS', 'SALES', 'CUSTOMER',
  'DEVELOPMENT', 'SUBSIDY', 'MA', 'FINANCE', 'HR', 'OTHER',
])

/** 円単位の金額。空欄は null、桁区切りのカンマは受け入れる */
const yenField = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null
    const raw = typeof v === 'number' ? String(v) : v.replace(/[,\s]/g, '')
    if (raw.length === 0) return null
    if (!/^\d+$/.test(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '金額は半角数字で入力してください' })
      return z.NEVER
    }
    return BigInt(raw)
  })

export const companySchema = z.object({
  name: requiredText(100, '会社名'),
  legalName: optionalText(100),
  stage: z.enum(['IDEA', 'PREPARING', 'ESTABLISHED', 'GROWING', 'ACQUIRED']).default('IDEA'),
  purpose: optionalText(4000),
  vision: optionalText(500),
  industry: optionalText(100),
  foundedOn: dateField,
  capital: yenField,
  fiscalMonth: z.coerce.number().int().min(1).max(12).nullish(),
  corporateNumber: optionalText(20),
  address: optionalText(200),
  phone: optionalText(30),
  website: optionalText(200),
  notes: optionalText(4000),
})

export type CompanyInput = z.infer<typeof companySchema>

export async function createCompany(input: CompanyInput, owner: { userId: string; name: string; email: string | null }) {
  const max = await prisma.coCompany.aggregate({ _max: { sortOrder: true } })
  return prisma.$transaction(async (tx) => {
    const company = await tx.coCompany.create({
      data: { ...input, sortOrder: (max._max.sortOrder ?? 0) + 10 },
    })
    // 作った人を必ず経営者として登録する。誰も編集できない会社ができるのを防ぐ
    await tx.coMember.create({
      data: {
        companyId: company.id,
        userId: owner.userId,
        name: owner.name,
        email: owner.email,
        role: 'OWNER',
        isOfficer: true,
      },
    })
    return company
  })
}

export async function updateCompany(id: string, input: Partial<CompanyInput>) {
  return prisma.coCompany.update({ where: { id }, data: input })
}

/** BigInt は JSON にできないので、API に返す前に文字列へ落とす */
export function serializeCompany<T extends { capital?: bigint | null }>(company: T): Omit<T, 'capital'> & { capital: string | null } {
  const { capital, ...rest } = company
  return { ...rest, capital: capital === null || capital === undefined ? null : capital.toString() }
}

// --- メンバー ---------------------------------------------------------------

export const memberSchema = z.object({
  name: requiredText(60, '名前'),
  email: optionalText(200),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER'),
  title: optionalText(60),
  department: optionalText(60),
  isOfficer: z.boolean().default(false),
  note: optionalText(500),
  active: z.boolean().default(true),
  userId: idRef,
})

export type MemberInput = z.infer<typeof memberSchema>

export async function listMembers(companyId: string, options: { includeInactive?: boolean } = {}) {
  return prisma.coMember.findMany({
    where: { companyId, ...(options.includeInactive ? {} : { active: true }) },
    orderBy: [{ isOfficer: 'desc' }, { role: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createMember(companyId: string, input: MemberInput) {
  return prisma.coMember.create({ data: { companyId, ...input } })
}

export async function updateMember(companyId: string, id: string, input: Partial<MemberInput>) {
  const found = await prisma.coMember.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!found) return null
  return prisma.coMember.update({ where: { id }, data: input })
}

/**
 * メンバーを消す。
 * 担当していたタスクは消さず、担当者だけ外れる（スキーマの onDelete: SetNull）。
 * 人が抜けた瞬間にタスクごと消えると、引き継ぎができない。
 */
export async function deleteMember(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coMember.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

// --- 株主 -------------------------------------------------------------------

export const shareholderSchema = z.object({
  name: requiredText(100, '株主名'),
  isCompany: z.boolean().default(false),
  shares: z.coerce.number().int().min(0).nullish(),
  ratio: z.coerce.number().min(0).max(100).nullish(),
  amount: yenField,
  note: optionalText(500),
})

export type ShareholderInput = z.infer<typeof shareholderSchema>

export async function listShareholders(companyId: string) {
  return prisma.coShareholder.findMany({ where: { companyId }, orderBy: [{ ratio: 'desc' }, { createdAt: 'asc' }] })
}

export async function createShareholder(companyId: string, input: ShareholderInput) {
  return prisma.coShareholder.create({ data: { companyId, ...input } })
}

export async function updateShareholder(companyId: string, id: string, input: Partial<ShareholderInput>) {
  const found = await prisma.coShareholder.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!found) return null
  return prisma.coShareholder.update({ where: { id }, data: input })
}

export async function deleteShareholder(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coShareholder.deleteMany({ where: { id, companyId } })
  return result.count > 0
}

// --- 重要書類 ---------------------------------------------------------------

export const documentSchema = z.object({
  name: requiredText(200, '書類名'),
  location: optionalText(500),
  area: AREA.default('COMPANY'),
  note: optionalText(1000),
  expiresOn: dateField,
  visibility: z.enum(['ALL', 'MANAGERS', 'OWNERS']).default('ALL'),
  projectId: idRef,
  taskId: idRef,
})

export type DocumentInput = z.infer<typeof documentSchema>

export async function listDocuments(companyId: string, role: CoRole, filters: { area?: string } = {}) {
  const where: Prisma.CoDocumentWhereInput = { companyId, ...visibilityFilter(role) }
  if (filters.area) where.area = filters.area as Prisma.CoDocumentWhereInput['area']
  return prisma.coDocument.findMany({
    where,
    include: { project: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
    orderBy: [{ expiresOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  })
}

/** 期限が近い書類（許認可の更新漏れを防ぐ）。日数は呼び出し側が決める */
export async function listExpiringDocuments(companyId: string, role: CoRole, within: Date) {
  return prisma.coDocument.findMany({
    where: { companyId, ...visibilityFilter(role), expiresOn: { not: null, lte: within } },
    orderBy: { expiresOn: 'asc' },
  })
}

export async function createDocument(companyId: string, input: DocumentInput) {
  return prisma.coDocument.create({ data: { companyId, ...input } })
}

export async function updateDocument(companyId: string, id: string, input: Partial<DocumentInput>) {
  const found = await prisma.coDocument.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!found) return null
  return prisma.coDocument.update({ where: { id }, data: input })
}

export async function deleteDocument(companyId: string, id: string): Promise<boolean> {
  const result = await prisma.coDocument.deleteMany({ where: { id, companyId } })
  return result.count > 0
}
