/**
 * 入力の共通部品。
 *
 * 画面と API の両方から同じ検証を通すためにここへ集約する。
 * 「画面では弾かれるが API からは通る」という穴を作らないため、
 * 各サービスは必ずこのスキーマ経由で値を受け取る。
 */
import { z } from 'zod'

import { parseDateInput } from '@/lib/company-os/date'

/** 空文字は「未入力」として null にそろえる */
export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      const trimmed = (v ?? '').trim()
      return trimmed.length > 0 ? trimmed : null
    })

export const requiredText = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message: `${label}を入力してください` })
    .refine((v) => v.length <= max, { message: `${label}は${max}文字以内で入力してください` })

/** YYYY-MM-DD（または空文字）を Date | null にする */
export const dateField = z
  .string()
  .nullish()
  .transform((v) => parseDateInput(v ?? null))

/** 日時（datetime-local 形式も受ける） */
export const dateTimeField = z
  .string()
  .min(1, '日時を入力してください')
  .transform((v, ctx) => {
    const parsed = new Date(v.length === 16 ? `${v}:00` : v)
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '日時の形式が正しくありません' })
      return z.NEVER
    }
    return parsed
  })

/** 空文字を null に落とす外部キー */
export const idRef = z
  .string()
  .nullish()
  .transform((v) => {
    const trimmed = (v ?? '').trim()
    return trimmed.length > 0 ? trimmed : null
  })

/** 0〜3 のインパクト値 */
export const impactField = z.coerce.number().int().min(0).max(3).default(0)
