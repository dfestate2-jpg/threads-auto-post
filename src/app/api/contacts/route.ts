import { ConsentStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { normalizeEmail, normalizePhone } from '@/lib/email/address'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim() ?? ''
    const consent = url.searchParams.get('consent')
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)

    const where = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
            ],
          }
        : {}),
      ...(consent && consent in ConsentStatus ? { consent: consent as ConsentStatus } : {}),
    }

    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ])

    return NextResponse.json({ total, page, pageSize: PAGE_SIZE, contacts })
  } catch (e) {
    return handleApiError(e)
  }
}

const createSchema = z.object({
  email: z.string().max(254),
  name: z.string().max(120).nullable().optional(),
  kana: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  consent: z.nativeEnum(ConsentStatus).optional(),
  consentNote: z.string().max(500).nullable().optional(),
  areas: z.array(z.string().max(60)).max(20).optional(),
  budgetMin: z.number().int().min(0).max(10_000_000).nullable().optional(),
  budgetMax: z.number().int().min(0).max(10_000_000).nullable().optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('STAFF')
    assertSameOrigin(request)
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)

    const email = normalizeEmail(parsed.data.email)
    if (!email) return jsonError('メールアドレスの形式が不正です', 400)

    // 過去に配信停止した宛先を、手入力で復活させられないようにする
    const suppressed = await prisma.suppression.findUnique({ where: { address: email } })
    if (suppressed) {
      return jsonError('このアドレスは配信停止済みです。本人からの再登録依頼がある場合は設定画面から解除してください', 409)
    }

    const contact = await prisma.contact.upsert({
      where: { email },
      create: {
        email,
        name: parsed.data.name ?? null,
        kana: parsed.data.kana ?? null,
        phone: normalizePhone(parsed.data.phone) ?? parsed.data.phone ?? null,
        source: 'MANUAL',
        consent: parsed.data.consent ?? ConsentStatus.UNKNOWN,
        consentAt: parsed.data.consent === ConsentStatus.OPTED_IN ? new Date() : null,
        consentNote: parsed.data.consentNote ?? null,
        areas: parsed.data.areas ?? [],
        budgetMin: parsed.data.budgetMin ?? null,
        budgetMax: parsed.data.budgetMax ?? null,
      },
      update: {
        name: parsed.data.name ?? undefined,
        kana: parsed.data.kana ?? undefined,
        phone: parsed.data.phone ? (normalizePhone(parsed.data.phone) ?? parsed.data.phone) : undefined,
        consentNote: parsed.data.consentNote ?? undefined,
        areas: parsed.data.areas ?? undefined,
        budgetMin: parsed.data.budgetMin ?? undefined,
        budgetMax: parsed.data.budgetMax ?? undefined,
      },
    })

    return NextResponse.json({ ok: true, contact })
  } catch (e) {
    return handleApiError(e)
  }
}
