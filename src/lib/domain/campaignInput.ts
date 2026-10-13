/**
 * 配信の入力スキーマ。
 *
 * 作成（POST /api/campaigns）と編集（PATCH /api/campaigns/[id]）の両方で使うため、
 * ルートの外に置いている。Next.js のルートファイルは決められた名前しか
 * export できないため、ここに切り出さないとビルドが通らない。
 */
import { CampaignChannel, PropertyType } from '@prisma/client'
import { z } from 'zod'

export const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  channel: z.nativeEnum(CampaignChannel).default(CampaignChannel.EMAIL),
  propertyIds: z.array(z.string()).max(20).default([]),
  segAreas: z.array(z.string().max(60)).max(20).default([]),
  segBudgetMin: z.number().int().min(0).max(10_000_000).nullable().optional(),
  segBudgetMax: z.number().int().min(0).max(10_000_000).nullable().optional(),
  segTypes: z.array(z.nativeEnum(PropertyType)).max(5).default([]),
  segOptedInOnly: z.boolean().default(true),
  segLineSilentOnly: z.boolean().default(false),
  segLineSilentDays: z.number().int().min(1).max(365).default(30),
})

export type CampaignInput = z.infer<typeof campaignSchema>
