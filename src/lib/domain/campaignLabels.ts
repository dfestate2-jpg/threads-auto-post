import type { CampaignStatus } from '@prisma/client'

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: '下書き',
  QUEUED: '送信待ち',
  SENDING: '送信中',
  PAUSED: '一時停止',
  SENT: '送信完了',
  FAILED: 'エラー',
}

export const CAMPAIGN_STATUS_CLASS: Record<CampaignStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  QUEUED: 'bg-blue-100 text-blue-800',
  SENDING: 'bg-blue-100 text-blue-800',
  PAUSED: 'bg-amber-100 text-amber-800',
  SENT: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
}
