/**
 * 賃貸保証会社 事前審査シミュレーター — 型定義
 *
 * 【重要】このシステムは信用情報機関の開示報告書を受領・保存しない。
 * ここに定義された入力は、すべて「お客様ご自身による選択式の申告」である。
 * 借入先名・残高・契約番号など、開示報告書固有の項目は意図的に定義していない。
 * 詳細 → docs/guarantee/03-legal-compliance.md
 */

/** 3値。「わからない」を潰さずに保持することが、この設計の肝。 */
export type Tri = 'yes' | 'no' | 'unknown'

/** 判定の5段階 */
export type Grade = '◎' | '○' | '△' | '×' | '？'

/** 保証会社が参照しうる情報源 */
export type Channel = 'cic' | 'jicc' | 'licc' | 'cgo' | 'own'

/**
 * 参照の確からしさ。
 * - yes      : 一次情報で加盟・参照が確認できている
 * - likely   : 一次情報あり、ただし全文未確認
 * - possible : 二次情報のみ。規程上は可能だが実務は不明
 * - no       : 参照しない
 */
export type ChannelAccess = 'yes' | 'likely' | 'possible' | 'no'

export type Confidence = 'high' | 'medium' | 'low'

export interface ChannelRef {
  access: ChannelAccess
  /** 0.0〜1.0。ペナルティに掛ける係数。access と実務観測から決める */
  weight: number
  confidence: Confidence
  /** 一次情報で確認できていれば true。false は画面に「※要確認」を出す */
  verified: boolean
  /** 根拠URL */
  sources?: string[]
  note?: string
}

export type CompanyCategory =
  | 'shinpan' // 信販系
  | 'licc' // 協会系（LICC）
  | 'cgo' // CGO系
  | 'independent' // 独立系

export interface CompanyProfile {
  key: string
  name: string
  category: CompanyCategory
  channels: Record<Channel, ChannelRef>
  /** 営業向けの一言メモ */
  note: string
  sources: string[]
}

// ---------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------

export type Employment =
  | 'fulltime' // 正社員
  | 'executive' // 会社役員
  | 'contract' // 契約社員
  | 'dispatch' // 派遣社員
  | 'parttime' // パート・アルバイト
  | 'selfemployed' // 自営業・フリーランス
  | 'pension' // 年金受給
  | 'student' // 学生
  | 'unemployed' // 無職
  | 'welfare' // 生活保護

export interface ApplicantInput {
  ageBand: 'under20' | '20s' | '30s' | '40s' | '50s' | '60s' | '70plus'
  nationality: 'jp' | 'foreign'
  /** 外国籍の場合の在留期限までの残月数 */
  residenceMonthsLeft?: number | null
  employment: Employment
  /** 勤続月数 */
  tenureMonths?: number | null
  /** 年収（万円）。不明なら null */
  annualIncomeManYen?: number | null
  /** 月額家賃（円。共益費込み） */
  monthlyRentYen: number
  /** 連帯保証人を立てられるか */
  hasGuarantor: boolean
  /** 緊急連絡先 */
  emergencyContact: 'family' | 'relative' | 'friend' | 'none'
  /** 本人名義の携帯電話を保有しているか */
  ownMobilePhone: boolean
  /** 預貯金が家賃の何ヶ月分あるか（申告ベース）。不明なら null */
  savingsMonths?: number | null
}

/** 保証会社の利用状況 */
export type GuaranteeStatus =
  | 'never' // 利用したことがない
  | 'clean' // 利用歴あり・滞納なし
  | 'late_minor' // 1ヶ月未満の遅れが数回
  | 'late_serious' // 2ヶ月以上の滞納
  | 'subrogation' // 代位弁済に至った
  | 'legal' // 訴訟・明渡しに至った

export interface GuaranteeHistoryEntry {
  /** CompanyProfile.key。対象8社以外は 'other_licc' / 'other_cgo' / 'other' を使う */
  companyKey: string
  status: GuaranteeStatus
  /** 何年前の出来事か。不明なら null */
  yearsAgo?: number | null
  /** 滞納分を完済したか */
  resolved: Tri
}

export type DebtRestructuring =
  | 'none'
  | 'voluntary' // 任意整理
  | 'civil_rehab' // 個人再生
  | 'bankruptcy' // 自己破産
  | 'unknown'

/**
 * 信用情報に関する「本人申告」。
 * 開示報告書を読み取った結果ではなく、お客様が選択肢から選んだ回答である。
 */
export interface CreditSelfReport {
  /** 現在、支払いが遅れているものがあるか */
  currentDelinquency: Tri
  /** 過去5年以内に61日以上または3ヶ月以上の延滞をしたことがあるか（＝CICの「異動」相当） */
  seriousDelinquency: Tri
  seriousDelinquencyYearsAgo?: number | null
  /** その延滞分を完済したか */
  seriousDelinquencyResolved: Tri
  debtRestructuring: DebtRestructuring
  debtRestructuringYearsAgo?: number | null
  /** 携帯・スマホ「本体代金の分割払い」を2ヶ月以上遅れたことがあるか（通信料金のみは含まない） */
  mobileInstallmentDelinquency: Tri
  /** 携帯の通信料金だけを遅れたことがあるか */
  utilityOnlyDelinquency: Tri
  /** 現在の借入件数（住宅ローン・自動車ローンを除く） */
  borrowingCount: 'none' | '1-2' | '3' | '4plus' | 'unknown'
  /** クレジットカード・ローンを一度も使ったことがない（スーパーホワイト） */
  noCreditHistory: Tri
  /**
   * CIC クレジット・ガイダンスのスコア帯（任意）。
   * お客様がご自身で確認された場合のみ、帯域で申告いただく。数値は保存しない。
   */
  cicGuidanceBand?: 'high' | 'mid' | 'low' | 'unknown'
}

export interface AssessmentInput {
  applicant: ApplicantInput
  /** 保証会社の利用歴。未ヒアリングなら空配列（＝不明として扱う） */
  guaranteeHistory: GuaranteeHistoryEntry[]
  /** 利用歴のヒアリングを実施済みか。false なら空配列を「不明」扱いにする */
  guaranteeHistoryAsked: boolean
  credit: CreditSelfReport
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

export interface Reason {
  ruleId: string
  /** 営業がそのままお客様に説明できる日本語 */
  text: string
  /** 減点（マイナス）／加点（プラス） */
  points: number
  /** 根拠となった情報源 */
  channel: Channel | null
  /** 一次情報で裏が取れていない前提に依存する場合 true → 画面に「※要確認」 */
  unverified: boolean
}

export interface CompanyAssessment {
  companyKey: string
  companyName: string
  category: CompanyCategory
  grade: Grade
  /** 0〜100。◎:90+ ○:70+ △:45+ ×:45未満 */
  score: number
  /** 判定を決定づけた理由（減点の大きい順） */
  reasons: Reason[]
  /** 追加ヒアリングすべき項目 */
  missingInfo: string[]
  /** 判定が一次未確認の前提に依存しているか */
  hasUnverifiedBasis: boolean
  note: string
}

export interface AssessmentResult {
  assessments: CompanyAssessment[]
  /** 全社共通の追加ヒアリング項目 */
  globalMissingInfo: string[]
  /** 営業への推奨アクション */
  recommendation: string
}
