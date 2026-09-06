/**
 * 追客管理の判定ロジック（副作用なし）。
 *
 * このファイルは「次に誰へ・いつ・何をするか」を決める中心にあたる。
 * 営業マンに次回追客日を入力させないという要件は、
 * ここで **ステータス開始時刻 + ルールの経過分数** から機械的に決めることで実現している。
 *
 * DB もネットワークも触らないため、そのままユニットテストできる。
 */
import type { ActionType, CustomerStatus, FollowUpPriority } from '@prisma/client'

// ---------------------------------------------------------------------------
// 表示用のラベル
// ---------------------------------------------------------------------------

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  NEW_INQUIRY: '新規反響',
  FIRST_CONTACTED: '初回対応済',
  HEARING_DONE: 'ヒアリング済',
  PROPOSING: '物件提案中',
  AWAITING_QUOTE: '見積書待ち',
  VIEWING_ARRANGING: '内見調整中',
  VIEWED: '内見済',
  APPLICATION_REVIEW: '申込検討',
  APPLIED: '申込済',
  CONTRACTED: '成約',
  ON_HOLD: '保留',
  NO_REPLY: '返信なし',
  LOST: '失注',
  DORMANT: '休眠',
}

/** 画面に並べるときの順序（営業の進捗順） */
export const CUSTOMER_STATUS_ORDER: CustomerStatus[] = [
  'NEW_INQUIRY',
  'FIRST_CONTACTED',
  'HEARING_DONE',
  'PROPOSING',
  'AWAITING_QUOTE',
  'VIEWING_ARRANGING',
  'VIEWED',
  'APPLICATION_REVIEW',
  'APPLIED',
  'CONTRACTED',
  'ON_HOLD',
  'NO_REPLY',
  'LOST',
  'DORMANT',
]

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  LINE: 'LINE',
  CALL: '電話',
  PROPOSE: '物件提案',
  VIEWING: '内見設定',
  QUOTE: '見積書依頼',
  MEETING: '来店・面談',
  SYSTEM: 'システム処理',
  OTHER: 'その他',
}

export const PRIORITY_LABEL: Record<FollowUpPriority, string> = {
  S: '今すぐ対応',
  A: '今日対応',
  B: '通常追客',
  C: '自動追客',
}

/** 追客の対象から外れたステータス（成約・失注）。次回アクションを持たない */
export const TERMINAL_STATUSES: CustomerStatus[] = ['CONTRACTED', 'LOST']

export function isTerminalStatus(status: CustomerStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------
// 次回アクションの決定
// ---------------------------------------------------------------------------

/** 自動追客ルール1段分。DB の FollowUpRule と同じ形（テストしやすいよう最小限に絞る） */
export interface FollowUpRuleLike {
  status: CustomerStatus
  step: number
  offsetMinutes: number
  actionType: ActionType
  label: string
  templateKey?: string | null
  notifyStaff?: boolean
  transitionTo?: CustomerStatus | null
  enabled?: boolean
}

export interface NextActionInput {
  status: CustomerStatus
  /** 現在のステータスになった時刻。ルールの経過分数はここを起点にする */
  statusSince: Date
  /** 現在のステータス内で消化済みのステップ数 */
  followUpStep: number
  autoFollowEnabled: boolean
  /**
   * 顧客からのLINEに社内の誰も返信していない場合、その受信時刻。
   * 未返信リマインド側の状態（conversations.replyState）から渡される。
   */
  awaitingReplySince?: Date | null
}

export interface NextAction {
  at: Date | null
  type: ActionType | null
  note: string | null
  /** 適用したルール（社内通知や自動遷移の判断に使う） */
  rule: FollowUpRuleLike | null
  /** ルールを消化しきった。営業マンの判断が必要な状態 */
  exhausted: boolean
}

const NO_ACTION: NextAction = { at: null, type: null, note: null, rule: null, exhausted: false }

/** ステータスに紐づく有効なルールを step 昇順で返す */
export function rulesForStatus(rules: FollowUpRuleLike[], status: CustomerStatus): FollowUpRuleLike[] {
  return rules.filter((r) => r.status === status && r.enabled !== false).sort((a, b) => a.step - b.step)
}

/**
 * 次回アクションを決める。【指示書 6・10】
 *
 * 「ステータス開始時刻 + そのステップの経過分数」で決まるため、
 * 1日後 → 3日後 → 7日後 …という指示書の追客リズムがそのまま再現される。
 * ステップを消化しきったら next は null になり、
 * 「ルール終了（要判断）」として今日の画面に必ず現れる（＝黙って消えない）。
 */
export const REPLY_PENDING_NOTE = '顧客から返信あり。内容を確認して返信'

export function resolveNextAction(input: NextActionInput, rules: FollowUpRuleLike[]): NextAction {
  if (isTerminalStatus(input.status)) return NO_ACTION

  /**
   * 顧客からのLINEに誰も返信していない状態は、どのルールよりも優先する。
   * 追客ルールで「2日後にLINE」と決まっていても、返事を待たせてはいけない。
   */
  if (input.awaitingReplySince) {
    return {
      at: input.awaitingReplySince,
      type: 'LINE',
      note: REPLY_PENDING_NOTE,
      rule: null,
      exhausted: false,
    }
  }

  if (!input.autoFollowEnabled) return NO_ACTION

  const applicable = rulesForStatus(rules, input.status)
  if (applicable.length === 0) return NO_ACTION

  const rule = applicable[input.followUpStep]
  if (!rule) return { ...NO_ACTION, exhausted: true }

  return {
    at: new Date(input.statusSince.getTime() + rule.offsetMinutes * 60_000),
    type: rule.actionType,
    note: rule.label,
    rule,
    exhausted: false,
  }
}

// ---------------------------------------------------------------------------
// 優先度の自動判定
// ---------------------------------------------------------------------------

const PRIORITY_RANKS: FollowUpPriority[] = ['S', 'A', 'B', 'C']

/**
 * ステータスごとの基準優先度。
 * 申込・内見調整・見積書待ちのように「決まる直前」ほど高くする。
 */
const BASE_RANK: Record<CustomerStatus, number> = {
  NEW_INQUIRY: 1, // A：反響直後の初動が最も成約率を左右する
  AWAITING_QUOTE: 1,
  VIEWING_ARRANGING: 1,
  APPLICATION_REVIEW: 1,
  APPLIED: 1,
  FIRST_CONTACTED: 2,
  HEARING_DONE: 2,
  PROPOSING: 2,
  VIEWED: 2,
  NO_REPLY: 2,
  ON_HOLD: 2,
  DORMANT: 3,
  CONTRACTED: 3,
  LOST: 3,
}

export interface PriorityInput {
  status: CustomerStatus
  nextActionAt: Date | null
  /** 手動で固定された優先度。あればそれを使う */
  override?: FollowUpPriority | null
  /** 引越し希望日。近いほど優先度を上げる */
  moveInBy?: Date | null
  autoFollowEnabled?: boolean
  /** 顧客からのLINEに未返信である */
  awaitingOurReply?: boolean
  now: Date
  /** 今日の終わり（タイムゾーン基準）。これ以前なら「今日やること」 */
  endOfToday: Date
  /** 今日の始まり（タイムゾーン基準）。これより前なら期限超過 */
  startOfToday: Date
}

/**
 * 追客優先度を自動判定する。【指示書 12】
 *
 * 判定材料：ステータス（＝顧客の進み具合）／次回アクションの期限／引越し希望時期。
 * 将来 AI に置き換える場合もこの関数の入出力を保てば差し替えられる。
 */
export function computePriority(input: PriorityInput): FollowUpPriority {
  if (input.override) return input.override
  if (isTerminalStatus(input.status)) return 'C'
  // 顧客を待たせている状態は無条件で最優先
  if (input.awaitingOurReply) return 'S'

  let rank = BASE_RANK[input.status]

  if (input.autoFollowEnabled === false) {
    rank += 1 // 自動追客を切っている顧客は今日の指示に出さない
  } else if (input.nextActionAt === null) {
    // ルールを消化しきった＝人の判断待ち。埋もれさせない
    rank = Math.min(rank, 1)
  } else if (input.nextActionAt.getTime() < input.startOfToday.getTime()) {
    rank -= 1 // 期限超過は必ず一段上げる
  } else if (input.nextActionAt.getTime() > input.endOfToday.getTime()) {
    rank += 1 // 期限がまだ先の顧客はシステムに任せる（自動追客）
  }

  // 引越し希望が1か月半以内なら、意思決定が近いので一段上げる
  if (input.moveInBy && input.moveInBy.getTime() - input.now.getTime() <= 45 * 86_400_000) {
    rank -= 1
  }

  const clamped = Math.min(PRIORITY_RANKS.length - 1, Math.max(0, rank))
  return PRIORITY_RANKS[clamped] as FollowUpPriority
}

// ---------------------------------------------------------------------------
// 今日やることの仕分け
// ---------------------------------------------------------------------------

export type TodayBucket = 'OVERDUE' | 'TOP' | 'NORMAL' | 'AUTO' | 'NEEDS_DECISION' | 'NONE'

export interface BucketInput {
  status: CustomerStatus
  nextActionAt: Date | null
  priority: FollowUpPriority
  autoFollowEnabled: boolean
  startOfToday: Date
  endOfToday: Date
}

/**
 * 顧客を「今日の営業画面」のどの区画に置くかを決める。【指示書 7・11】
 *
 * - OVERDUE        期限超過。赤で最上段に出す
 * - TOP            今日やること（優先度 S / A）
 * - NORMAL         今日やること（優先度 B / C）
 * - AUTO           まだ期限が来ていない＝自動追客中。件数だけ出す
 * - NEEDS_DECISION ルールを消化しきった。営業マンの判断が要る
 * - NONE           成約・失注・自動追客OFF。今日の画面には出さない
 */
export function bucketOf(input: BucketInput): TodayBucket {
  if (isTerminalStatus(input.status)) return 'NONE'
  if (input.nextActionAt === null) {
    return input.autoFollowEnabled ? 'NEEDS_DECISION' : 'NONE'
  }
  if (input.nextActionAt.getTime() < input.startOfToday.getTime()) return 'OVERDUE'
  if (input.nextActionAt.getTime() > input.endOfToday.getTime()) return 'AUTO'
  return input.priority === 'S' || input.priority === 'A' ? 'TOP' : 'NORMAL'
}

/**
 * 「見積書待ち 3日」のような、今日やる理由の一言説明を作る。
 * 営業マンが顧客名を見た瞬間に状況を思い出せるようにするための文字列。
 */
export function reasonLabel(status: CustomerStatus, statusSince: Date, now: Date): string {
  const days = Math.floor((now.getTime() - statusSince.getTime()) / 86_400_000)
  const hours = Math.floor((now.getTime() - statusSince.getTime()) / 3_600_000)
  const elapsed = days >= 1 ? `${days}日` : `${Math.max(0, hours)}時間`
  return `${CUSTOMER_STATUS_LABEL[status]} ${elapsed}`
}

/** 期限超過の日数。超過していなければ 0 */
export function overdueDays(nextActionAt: Date | null, startOfToday: Date): number {
  if (!nextActionAt) return 0
  const diff = startOfToday.getTime() - nextActionAt.getTime()
  if (diff <= 0) return 0
  return Math.max(1, Math.ceil(diff / 86_400_000))
}
