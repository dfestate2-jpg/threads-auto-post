export interface EscalationRuleInput {
  id: string
  name: string
  /** 未返信がこの分数を超えたら発火（firstUnrepliedAt 基準） */
  thresholdMinutes: number
  notifyAssignee: boolean
  notifyManager: boolean
  notifyAdmins: boolean
  notifyGroup: boolean
  enabled: boolean
}

export type TargetChannel = 'LINE_GROUP' | 'LINE_USER' | 'WEBHOOK'

export interface NotifyTarget {
  channel: TargetChannel
  /** LINE の userId / groupId、または Webhook URL */
  target: string
  /** 通知ログ・管理画面に出す説明ラベル */
  label: string
  /** どの役割として選ばれたか */
  role: 'ASSIGNEE' | 'MANAGER' | 'ADMIN' | 'GROUP' | 'FALLBACK'
}

export interface StaffTarget {
  id: string
  name: string
  lineUserId: string | null
  notifyEnabled: boolean
  active: boolean
}

export interface ChannelTarget {
  id: string
  name: string
  type: TargetChannel
  target: string
}

export interface ResolveTargetsInput {
  elapsedMinutes: number
  rules: EscalationRuleInput[]
  assignee: StaffTarget | null
  manager: StaffTarget | null
  admins: StaffTarget[]
  /** 社内共通の通知先。担当者未設定時の受け皿であり、同報先でもある */
  groupChannels: ChannelTarget[]
  /**
   * 担当者が設定されていても社内共通の通知先へ同報するか。
   * 担当者以外（事務など）が返信する運用では true にする。
   */
  alwaysIncludeGroup?: boolean
  /** 管理者向けチャネル */
  adminChannels: ChannelTarget[]
  /** 主経路が空・失敗したときの最終手段 */
  fallbackChannels: ChannelTarget[]
}

/** 経過分に到達済みの有効ルールを閾値昇順で返す */
export function matchedRules(elapsedMinutes: number, rules: EscalationRuleInput[]): EscalationRuleInput[] {
  return rules
    .filter((r) => r.enabled && r.thresholdMinutes <= elapsedMinutes)
    .sort((a, b) => a.thresholdMinutes - b.thresholdMinutes)
}

/** 到達済みルールのうち最大の閾値（= 現在のエスカレーション段階） */
export function currentEscalationLevel(elapsedMinutes: number, rules: EscalationRuleInput[]): number {
  const m = matchedRules(elapsedMinutes, rules)
  const last = m[m.length - 1]
  return last ? last.thresholdMinutes : 0
}

/**
 * 前回記録した段階より上に「新しく到達した」ルールを返す。
 * これが空でなければ、通常の間隔を待たずにエスカレーション通知を出す。
 */
export function newlyCrossedRules(
  elapsedMinutes: number,
  previousLevelMinutes: number,
  rules: EscalationRuleInput[],
): EscalationRuleInput[] {
  return matchedRules(elapsedMinutes, rules).filter((r) => r.thresholdMinutes > previousLevelMinutes)
}

function pushStaff(out: NotifyTarget[], staff: StaffTarget | null, role: NotifyTarget['role']): void {
  if (!staff || !staff.active || !staff.notifyEnabled || !staff.lineUserId) return
  out.push({ channel: 'LINE_USER', target: staff.lineUserId, label: staff.name, role })
}

function pushChannels(out: NotifyTarget[], channels: ChannelTarget[], role: NotifyTarget['role']): void {
  for (const c of channels) {
    out.push({ channel: c.type, target: c.target, label: c.name, role })
  }
}

function dedupe(targets: NotifyTarget[]): NotifyTarget[] {
  const seen = new Set<string>()
  const out: NotifyTarget[] = []
  for (const t of targets) {
    const key = `${t.channel}:${t.target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/**
 * 通知先を解決する。
 *
 * - 基本の宛先は「担当者」。担当者が未設定・通知不可なら社内共通グループ。【仕様③】
 * - 経過時間で到達したエスカレーションルールの宛先を **加算** する。
 *   例: 1時間→担当者 / 3時間→担当者＋責任者 / 6時間→管理者
 * - 同一宛先は必ず1回に集約する（二重通知の防止）。
 * - 解決結果が空になった場合は共通グループ→冗長チャネルの順にフォールバックする
 *   （通知先の設定漏れで通知が消えるのを防ぐ）。
 */
export function resolveNotifyTargets(input: ResolveTargetsInput): NotifyTarget[] {
  const out: NotifyTarget[] = []
  const matched = matchedRules(input.elapsedMinutes, input.rules)

  // --- 基本宛先（仕様③） ---
  const assigneeNotifiable =
    !!input.assignee && input.assignee.active && input.assignee.notifyEnabled && !!input.assignee.lineUserId
  if (assigneeNotifiable) {
    pushStaff(out, input.assignee, 'ASSIGNEE')
    /**
     * 担当者以外（事務など）が返信することがあるため、既定では社内共通の通知先へも同報する。
     * 「担当者にしか届かない」と、担当者が外出中の案件を他の人が拾えない。
     * 宛先は最後に重複排除されるので、担当者が共通の通知先にも入っていても二重には送られない。
     */
    if (input.alwaysIncludeGroup !== false) pushChannels(out, input.groupChannels, 'GROUP')
  } else {
    pushChannels(out, input.groupChannels, 'GROUP')
  }

  // --- エスカレーションによる加算 ---
  for (const rule of matched) {
    if (rule.notifyAssignee) pushStaff(out, input.assignee, 'ASSIGNEE')
    if (rule.notifyManager) pushStaff(out, input.manager, 'MANAGER')
    if (rule.notifyAdmins) {
      for (const admin of input.admins) pushStaff(out, admin, 'ADMIN')
      pushChannels(out, input.adminChannels, 'ADMIN')
    }
    if (rule.notifyGroup) pushChannels(out, input.groupChannels, 'GROUP')
  }

  let resolved = dedupe(out)
  if (resolved.length === 0) {
    resolved = dedupe([
      ...(() => {
        const g: NotifyTarget[] = []
        pushChannels(g, input.groupChannels, 'GROUP')
        return g
      })(),
    ])
  }
  if (resolved.length === 0) {
    const f: NotifyTarget[] = []
    pushChannels(f, input.fallbackChannels, 'FALLBACK')
    resolved = dedupe(f)
  }
  return resolved
}
