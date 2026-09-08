/**
 * Company OS の表示ラベルと配色。
 *
 * 画面ごとに日本語を書くと、同じ状態が場所によって違う言葉で出てしまう。
 * enum → 日本語 → 色 の対応はすべてここに集約し、画面はここだけを参照する。
 * Tailwind はクラス名を静的に走査するため、色は必ず完全なクラス名で持つ。
 */
import type {
  CoArea,
  CoIssueStatus,
  CoObjectiveStatus,
  CoPriority,
  CoProjectStatus,
  CoQuestionStatus,
  CoRole,
  CoSeverity,
  CoStage,
  CoTaskStatus,
  CoVisibility,
} from '@prisma/client'

export const TASK_STATUS_LABEL: Record<CoTaskStatus, string> = {
  TODO: '未着手',
  IN_PROGRESS: '進行中',
  REVIEW: '確認待ち',
  DONE: '完了',
  ON_HOLD: '保留',
  CANCELED: '中止',
}

export const TASK_STATUS_CLASS: Record<CoTaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-700 border-slate-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  REVIEW: 'bg-violet-100 text-violet-800 border-violet-200',
  DONE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ON_HOLD: 'bg-amber-100 text-amber-800 border-amber-200',
  CANCELED: 'bg-slate-100 text-slate-400 border-slate-200',
}

/** 完了・中止は「もう動かないタスク」。集計ではまとめて除外する */
export const CLOSED_TASK_STATUSES: CoTaskStatus[] = ['DONE', 'CANCELED']
export const OPEN_TASK_STATUSES: CoTaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'ON_HOLD']

export const PRIORITY_LABEL: Record<CoPriority, string> = {
  TOP: '最優先',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
}

export const PRIORITY_CLASS: Record<CoPriority, string> = {
  TOP: 'bg-red-600 text-white border-red-700',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  MEDIUM: 'bg-slate-100 text-slate-700 border-slate-200',
  LOW: 'bg-slate-50 text-slate-500 border-slate-200',
}

export const AREA_LABEL: Record<CoArea, string> = {
  COMPANY: '会社設立',
  LEGAL: '法務',
  MANAGEMENT: '経営',
  BUSINESS: '事業・商品',
  SALES: '営業',
  CUSTOMER: '顧客',
  DEVELOPMENT: '開発',
  SUBSIDY: '補助金',
  MA: 'M&A',
  FINANCE: '財務',
  HR: '人事・組織',
  OTHER: 'その他',
}

export const AREA_ICON: Record<CoArea, string> = {
  COMPANY: '🏢',
  LEGAL: '⚖️',
  MANAGEMENT: '🧭',
  BUSINESS: '📦',
  SALES: '📣',
  CUSTOMER: '🤝',
  DEVELOPMENT: '💻',
  SUBSIDY: '🎁',
  MA: '🔀',
  FINANCE: '💰',
  HR: '👥',
  OTHER: '📌',
}

export const PROJECT_STATUS_LABEL: Record<CoProjectStatus, string> = {
  PLANNING: '計画中',
  ACTIVE: '進行中',
  ON_HOLD: '保留',
  DONE: '完了',
  CANCELED: '中止',
}

export const PROJECT_STATUS_CLASS: Record<CoProjectStatus, string> = {
  PLANNING: 'bg-slate-100 text-slate-700 border-slate-200',
  ACTIVE: 'bg-blue-100 text-blue-800 border-blue-200',
  ON_HOLD: 'bg-amber-100 text-amber-800 border-amber-200',
  DONE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CANCELED: 'bg-slate-100 text-slate-400 border-slate-200',
}

export const ISSUE_STATUS_LABEL: Record<CoIssueStatus, string> = {
  OPEN: '未対応',
  INVESTIGATING: '調査中',
  ACTING: '対策中',
  RESOLVED: '解決',
  ON_HOLD: '保留',
}

export const ISSUE_STATUS_CLASS: Record<CoIssueStatus, string> = {
  OPEN: 'bg-red-100 text-red-800 border-red-200',
  INVESTIGATING: 'bg-amber-100 text-amber-800 border-amber-200',
  ACTING: 'bg-blue-100 text-blue-800 border-blue-200',
  RESOLVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ON_HOLD: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const OPEN_ISSUE_STATUSES: CoIssueStatus[] = ['OPEN', 'INVESTIGATING', 'ACTING']

export const SEVERITY_LABEL: Record<CoSeverity, string> = {
  CRITICAL: '重大',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
}

export const SEVERITY_CLASS: Record<CoSeverity, string> = {
  CRITICAL: 'bg-red-600 text-white border-red-700',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  MEDIUM: 'bg-slate-100 text-slate-700 border-slate-200',
  LOW: 'bg-slate-50 text-slate-500 border-slate-200',
}

export const QUESTION_STATUS_LABEL: Record<CoQuestionStatus, string> = {
  OPEN: '未着手',
  DISCUSSING: '検討中',
  DECIDED: '決定済み',
  DEFERRED: '保留',
}

export const QUESTION_STATUS_CLASS: Record<CoQuestionStatus, string> = {
  OPEN: 'bg-red-100 text-red-800 border-red-200',
  DISCUSSING: 'bg-amber-100 text-amber-800 border-amber-200',
  DECIDED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  DEFERRED: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const OBJECTIVE_STATUS_LABEL: Record<CoObjectiveStatus, string> = {
  ON_TRACK: '順調',
  AT_RISK: '黄信号',
  OFF_TRACK: '未達見込み',
  ACHIEVED: '達成',
  DROPPED: '取り下げ',
}

export const OBJECTIVE_STATUS_CLASS: Record<CoObjectiveStatus, string> = {
  ON_TRACK: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  AT_RISK: 'bg-amber-100 text-amber-800 border-amber-200',
  OFF_TRACK: 'bg-red-100 text-red-800 border-red-200',
  ACHIEVED: 'bg-blue-100 text-blue-800 border-blue-200',
  DROPPED: 'bg-slate-100 text-slate-400 border-slate-200',
}

export const STAGE_LABEL: Record<CoStage, string> = {
  IDEA: '構想中',
  PREPARING: '設立準備中',
  ESTABLISHED: '設立済み',
  GROWING: '成長期',
  ACQUIRED: '買収した会社',
}

export const ROLE_LABEL: Record<CoRole, string> = {
  OWNER: '経営者',
  ADMIN: '管理者',
  MANAGER: '責任者',
  MEMBER: 'メンバー',
  VIEWER: '閲覧のみ',
}

export const VISIBILITY_LABEL: Record<CoVisibility, string> = {
  ALL: '全員',
  MANAGERS: '責任者以上',
  OWNERS: '経営者のみ',
}

/** インパクト（売上・リスク）の 0〜3 を言葉にする */
export const IMPACT_LABEL: Record<number, string> = {
  0: 'なし',
  1: '小',
  2: '中',
  3: '大',
}

/** <select> に流し込むための [値, ラベル] の並び */
export function optionsOf<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))
}
