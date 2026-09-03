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
  /** 「責任者にも通知」など、誰に広がったかの短い説明 */
  escalationNote?: string | null
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
 *
 * 読むのはスマホのLINEで、しかも**営業中の担当者**。
 * 情報を並べるほど読み飛ばされるので、次の行動を変えないものは載せない。
 * 載せるのは「誰が・どれだけ待っているか・何の話か・自分の担当か」の4つだけ。
 *
 * 落とした情報（リマインド回数、最新メッセージ基準の経過時間）は
 * 管理画面で見られる。通知は判断のきっかけであって、記録ではない。
 *
 * システム警告（WATCHDOG）だけは管理者向けなので、これまで通り詳しく出す。
 */
export function buildNotificationText(ctx: NotificationContext): string {
  if (ctx.kind === 'WATCHDOG') return buildWatchdogText(ctx)

  const lines: string[] = []
  lines.push(headline(ctx))
  lines.push(`${ctx.customerName} 様（担当：${ctx.assigneeName ?? '未設定'}）`)
  if (ctx.includeMessageBody) {
    lines.push(`『${buildExcerpt(ctx.lastMessage, ctx.excerptLength)}』`)
  }
  // 管理画面を開くのは管理者と事務。営業担当は使わないので最後に置く
  if (ctx.detailUrl) lines.push(ctx.detailUrl)
  lines.push('')
  lines.push('返信したら下のボタンをタップしてください。')

  return lines.join('\n')
}

/**
 * 1行目。放置が長引くほど強くする。
 *
 * 経過時間は **最初の未返信から** の一本に統一した。
 * 顧客が追加メッセージを送るたびに短い数字が出ると、
 * 連投されている案件ほど軽く見えて後回しになる。実際は逆に急ぐべきもの。
 */
function headline(ctx: NotificationContext): string {
  const elapsed = formatElapsedJa(ctx.totalUnrepliedMinutes)

  if (ctx.kind === 'GUARD') return `⚠️ 未返信 ${elapsed}（メッセージ連投中）`

  const mark = ctx.totalUnrepliedMinutes >= 1440 ? '🚨🚨' : ctx.kind === 'ESCALATION' ? '🚨' : '⚠️'
  const note = ctx.escalationNote ? `／${ctx.escalationNote}` : ''
  return `${mark} 未返信 ${elapsed}${note}`
}

/** 配信遅延の警告。宛先は管理者なので、原因を追える情報を残す */
function buildWatchdogText(ctx: NotificationContext): string {
  const lines: string[] = [
    '🛠 【システム警告】未返信リマインドの配信が遅延しています',
    '',
    `顧客名：${ctx.customerName}様`,
    `未返信時間：${formatElapsedJa(ctx.unrepliedMinutes)}`,
    `最初の未返信から：${formatElapsedJa(ctx.totalUnrepliedMinutes)}`,
    `担当者：${ctx.assigneeName ?? '未設定（社内共有）'}`,
    `リマインド回数：${ctx.reminderCount}回目`,
  ]
  if (ctx.includeMessageBody) {
    lines.push(`最終メッセージ：『${buildExcerpt(ctx.lastMessage, ctx.excerptLength)}』`)
  }
  lines.push('')
  lines.push('定期実行が止まっている可能性があります。管理画面の「受信状況」を確認してください。')
  if (ctx.detailUrl) lines.push(ctx.detailUrl)
  return lines.join('\n')
}

/** ログ出力用にメッセージ本文を伏せる（個人情報をログに残さない） */
export function redactText(text: string | null | undefined): string {
  if (!text) return '(empty)'
  return `(${text.length} chars)`
}
