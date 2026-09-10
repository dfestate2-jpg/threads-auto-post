/**
 * CSV による配信先の一括取込。
 *
 * フォーム回答のエクスポート（スプレッドシート / Googleフォーム / formrun 等）を
 * そのまま貼り付けても通るよう、列名の表記揺れは domain/csv.ts で吸収している。
 */
import { ConsentStatus, ContactSource } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireApiSession } from '@/lib/auth/guard'
import { parseContactsCsv } from '@/lib/domain/csv'
import { normalizeEmail } from '@/lib/email/address'
import { assertSameOrigin, handleApiError, jsonError } from '@/lib/http'
import { importContacts } from '@/lib/services/contacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 1回の取込で扱う上限。これを超える場合はファイルを分割してもらう */
const MAX_ROWS = 5000
const MAX_BYTES = 5 * 1024 * 1024

const schema = z.object({
  csv: z.string().min(1),
  source: z.nativeEnum(ContactSource).default(ContactSource.IMPORT),
  consentNote: z.string().max(500).nullable().optional(),
  /**
   * CSV に同意列が無いとき、全件を「同意あり」として扱うか。
   * 既定は false。true にできるのは、フォームに配信同意の記載があった場合だけ。
   */
  treatAsOptedIn: z.boolean().default(false),
  /** true なら解析だけ行い、DBには書き込まない */
  dryRun: z.boolean().default(false),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireApiSession('MANAGER')
    assertSameOrigin(request)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError('入力値が不正です', 400)
    const { csv, source, consentNote, treatAsOptedIn, dryRun } = parsed.data

    if (Buffer.byteLength(csv, 'utf8') > MAX_BYTES) {
      return jsonError('ファイルが大きすぎます（5MBまで）。分割して取り込んでください', 413)
    }

    const result = parseContactsCsv(csv, normalizeEmail)
    if (result.rows.length === 0) {
      return jsonError(result.errors[0]?.reason ?? '取り込める行がありませんでした', 400, {
        errors: result.errors.slice(0, 50),
        detected: result.detected,
      })
    }
    if (result.rows.length > MAX_ROWS) {
      return jsonError(`一度に取り込めるのは${MAX_ROWS}件までです。ファイルを分割してください`, 413)
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        detected: result.detected,
        parsed: result.rows.length,
        errors: result.errors.slice(0, 50),
        errorCount: result.errors.length,
        sample: result.rows.slice(0, 10).map((r) => ({
          email: r.email,
          name: r.name,
          areas: r.areas,
          budgetMax: r.budgetMax,
          consent: r.consent,
        })),
      })
    }

    const summary = await importContacts(result.rows, {
      source,
      consentNote: consentNote ?? null,
      defaultConsent: treatAsOptedIn ? ConsentStatus.OPTED_IN : ConsentStatus.UNKNOWN,
    })

    return NextResponse.json({
      ok: true,
      detected: result.detected,
      ...summary,
      errors: result.errors.slice(0, 50),
      errorCount: result.errors.length,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
