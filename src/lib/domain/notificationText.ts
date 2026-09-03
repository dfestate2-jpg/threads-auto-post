import { formatElapsedJa } from './time'

export type NotificationKind = 'ROUTINE' | 'ESCALATION' | 'GUARD' | 'WATCHDOG'

export interface NotificationContext {
  kind: NotificationKind
  customerName: string
  /** 最新顧客メッセージ基準の未返信経過（分）【仕様①のカウント】 */
  unrepliedMinutes: number
  /** 最初の未返信メッセージ基準の経過（分）。連投時に unrepliedMinutes と乖離する */
  totalUnrepliedMinutes: number
  lastMessage: string | null
  assigneeName: string | null
  reminderCount: number
  /** エスカレーション時の閾値（分） */
  escalationThresholdMinutes?: number
  escalationRuleName?: string
  /** 管理画面の該当顧客ページURL */
  detailUrl?: string | null
  includeMessageBody: boolean
  excerptLength: number
}

/** 通知本文に載せるメッセージ抜粋を作る（改行の潰し込み・文字数制限） */
export function buildExcerpt(text: string | null, maxLength: number): string {
  if (!text) return '（テキスト以外のメッセージ）'
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return '（テキスト以外のメッセージ）'
  if (flat.length <= maxLength) return flat
  return `${flat.slice(0, maxLength)}…`
}

/**
 * 社内LINEへ送る通知本文を組み立てる。
 * 依頼仕様のフォーマットを基本形とし、種別に応じて情報を追加する。
 */
export function buildNotificationText(ctx: NotificationContext): string {
  const lines: string[] = []

  switch (ctx.kind) {
    case 'ESCALATION':
      lines.push('🚨 【エスカレーション】公式LINE未返信')
      break
    case 'GUARD':
      lines.push('⚠️ 公式LINE未返信リマインド（連投継続中）')
      break
    case 'WATCHDOG':
      lines.push('🛠 【システム警告】未返信リマインドの配信が遅延しています')
      break
    default:
      lines.push('⚠️ 公式LINE未返信リマインド')
  }
  lines.push('')

  lines.push(`顧客名：${ctx.customerName}様`)
  lines.push(`未返信時間：${formatElapsedJa(ctx.unrepliedMinutes)}`)

  // 顧客の追加メッセージでカウントが再スタートしているとき、
  // 実際の放置時間が分からなくなるのを防ぐため併記する
  if (ctx.totalUnrepliedMinutes - ctx.unrepliedMinutes >= 5) {
    lines.push(`（最初の未返信から：${formatElapsedJa(ctx.totalUnrepliedMinutes)}）`)
  }

  if (ctx.includeMessageBody) {
    lines.push('最終メッセージ：')
    lines.push(`『${buildExcerpt(ctx.lastMessage, ctx.excerptLength)}』`)
  }
  lines.push('')

  lines.push(`担当者：${ctx.assigneeName ?? '未設定（社内共有）'}`)

  if (ctx.kind === 'ESCALATION' && ctx.escalationThresholdMinutes !== undefined) {
    lines.push(
      `エスカレーション：${formatElapsedJa(ctx.escalationThresholdMinutes)}経過${
        ctx.escalationRuleName ? `（${ctx.escalationRuleName}）` : ''
      }`,
    )
  }
  if (ctx.reminderCount > 0) {
    lines.push(`リマインド回数：${ctx.reminderCount}回目`)
  }
  lines.push('')

  lines.push('👉 公式LINEを確認してください。')
  if (ctx.detailUrl) {
    lines.push(ctx.detailUrl)
  }

  return lines.join('\n')
}

/** ログ出力用にメッセージ本文を伏せる（個人情報をログに残さない） */
export function redactText(text: string | null | undefined): string {
  if (!text) return '(empty)'
  return `(${text.length} chars)`
}
