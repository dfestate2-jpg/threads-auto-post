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
  /** 設定画面で編集できる本文テンプレート。空なら既定を使う */
  template?: string | null
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
 * リマインド本文の既定テンプレート。
 *
 * 読むのはスマホのLINEで、しかも営業中の担当者。情報を並べるほど読み飛ばされるので、
 * 次の行動を変えないものは載せない。載せるのは
 * 「誰が・どれだけ待っているか・何の話か・自分の担当か」の4つだけ。
 *
 * 管理画面のURLは既定では入れない。毎回URLが並ぶとトークが読みにくくなるうえ、
 * グループのノートに貼っておけば十分なため。必要なら {URL} を足せば戻せる。
 */
export const DEFAULT_NOTIFICATION_TEMPLATE = `{印} 未返信 {経過時間}{補足}
{顧客名} 様（担当：{担当者}）
『{メッセージ}』

返信したら下のボタンをタップしてください。`

/** テンプレートで使える差し込み。設定画面の説明と一致させること */
export const TEMPLATE_PLACEHOLDERS = [
  { key: '{印}', description: '⚠️ / 🚨 / 🚨🚨（放置が長いほど強くなる）' },
  { key: '{経過時間}', description: '最初の未返信からの経過。例：1時間20分' },
  { key: '{補足}', description: '「／責任者にも通知」「（メッセージ連投中）」など。無ければ空' },
  { key: '{顧客名}', description: '顧客名。未取得なら（名称未取得）' },
  { key: '{担当者}', description: '担当者名。未設定なら「未設定」' },
  { key: '{メッセージ}', description: '顧客の最終メッセージの抜粋' },
  { key: '{URL}', description: '管理画面の顧客ページURL' },
] as const

/**
 * テンプレートに値を差し込む。
 *
 * **差し込んだ結果が空になった行は落とす。** 「メッセージを載せない」設定のときに
 * 『』だけの行が残ったり、URLを外したのに空行が増えたりするのを防ぐ。
 * 未知の差し込みはそのまま残す。黙って消すと、書き間違いに気づけない。
 */
export function renderNotificationTemplate(template: string, values: Record<string, string>): string {
  const PLACEHOLDER = /\{[^}\n]{1,20}\}/
  const substitute = (line: string): string =>
    line.replace(new RegExp(PLACEHOLDER, 'g'), (m) => (m in values ? values[m]! : m))

  return template
    .split('\n')
    .filter((rawLine) => {
      // 元から固定文・空行の行はそのまま残す（意図した空行を消さない）
      if (!PLACEHOLDER.test(rawLine)) return true
      // 差し込んだ結果、記号しか残らなかった行は中身が無かったということ
      return substitute(rawLine).replace(/[『』（）「」：:\s]/g, '').length > 0
    })
    .map(substitute)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 社内LINEへ送る通知本文を組み立てる。
 *
 * 文面は設定画面から変えられる。壊れたテンプレートでも通知は止めない
 * （空なら既定に戻す）。通知が出ないことのほうが、文面が崩れることより重大。
 *
 * システム警告（WATCHDOG）だけは管理者向けなので、これまで通り詳しく出す。
 */
export function buildNotificationText(ctx: NotificationContext): string {
  if (ctx.kind === 'WATCHDOG') return buildWatchdogText(ctx)

  const template = ctx.template?.trim() ? ctx.template : DEFAULT_NOTIFICATION_TEMPLATE
  return renderNotificationTemplate(template, {
    '{印}': severityMark(ctx),
    '{経過時間}': formatElapsedJa(ctx.totalUnrepliedMinutes),
    '{補足}': supplement(ctx),
    '{顧客名}': ctx.customerName,
    '{担当者}': ctx.assigneeName ?? '未設定',
    '{メッセージ}': ctx.includeMessageBody ? buildExcerpt(ctx.lastMessage, ctx.excerptLength) : '',
    '{URL}': ctx.detailUrl ?? '',
  })
}

/**
 * 放置が長いほど強くする。
 *
 * 経過時間は **最初の未返信から** の一本にしている。
 * 顧客が追加メッセージを送るたびに短い数字が出ると、
 * 連投されている案件ほど軽く見えて後回しになる。実際は逆に急ぐべきもの。
 */
function severityMark(ctx: NotificationContext): string {
  if (ctx.totalUnrepliedMinutes >= 1440) return '🚨🚨'
  return ctx.kind === 'ESCALATION' ? '🚨' : '⚠️'
}

function supplement(ctx: NotificationContext): string {
  if (ctx.kind === 'GUARD') return '（メッセージ連投中）'
  return ctx.escalationNote ? `／${ctx.escalationNote}` : ''
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

export interface DigestEntry {
  customerName: string
  /** 最初の未返信からの経過（分） */
  totalUnrepliedMinutes: number
  assigneeName: string | null
}

/**
 * 2回目以降のリマインドをまとめた1通。
 *
 * 問い合わせが多いと1件1通では社内LINEが埋まり、かえって見落とす。
 * 初回だけ個別（ボタン付き）で出し、繰り返しはここにまとめる。
 *
 * **まとめ通知にボタンは付けない。** ボタンは宛先の顧客が1人に定まって
 * いないと押し間違いを生み、「対応していない案件を対応済みにする」という
 * 一番まずい事故になる。操作は一覧から個別に開いて行う。
 *
 * 放置が長い順に並べる。上から読めば手を付ける順になる。
 */
export function buildDigestText(entries: DigestEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.totalUnrepliedMinutes - a.totalUnrepliedMinutes)
  const lines: string[] = [`⚠️ 未返信 ${sorted.length}件（継続中）`, '']

  for (const e of sorted) {
    const mark = e.totalUnrepliedMinutes >= 1440 ? '🚨🚨' : e.totalUnrepliedMinutes >= 180 ? '🚨' : '⚠️'
    lines.push(
      `${mark} ${e.customerName} 様 ${formatElapsedJa(e.totalUnrepliedMinutes)}（担当：${e.assigneeName ?? '未設定'}）`,
    )
  }

  lines.push('')
  lines.push('対応済みにするには一覧から開いてください。')
  return lines.join('\n')
}
