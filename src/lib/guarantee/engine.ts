import { COMPANIES, COMPANY_MAP, isCgoMember, isLiccMember } from './companies'
import type {
  AssessmentInput,
  AssessmentResult,
  Channel,
  CompanyAssessment,
  CompanyProfile,
  Grade,
  GuaranteeHistoryEntry,
  Reason,
} from './types'

/**
 * 判定エンジン。
 *
 * 設計方針：
 *  1) 100点から減点していく。閾値でグレードに写像する（ブラックボックスにしない）
 *  2) 減点は「その会社がその情報を見られるか（channel weight）」を必ず掛ける
 *     → 同じ事故情報でも、信販系は×、独立系は影響なし、が自動的に導かれる
 *  3) 「わからない」は握りつぶさず、判定を△に丸めたうえで追加ヒアリング項目として返す
 *  4) 全ての減点は必ず日本語の理由を伴う。理由のない減点を作らない
 *
 * ルール一覧の意味 → docs/guarantee/05-scoring-rules.md
 */

const THRESHOLD = { excellent: 90, good: 70, caution: 45 } as const

/** 「情報不足」により良い判定を出せない場合に丸める上限 */
const UNKNOWN_CAP = 62

function gradeFromScore(score: number): Grade {
  if (score >= THRESHOLD.excellent) return '◎'
  if (score >= THRESHOLD.good) return '○'
  if (score >= THRESHOLD.caution) return '△'
  return '×'
}

interface Ctx {
  input: AssessmentInput
  company: CompanyProfile
  reasons: Reason[]
  missing: string[]
  hardReject: boolean
  unverifiedBasis: boolean
}

function w(company: CompanyProfile, ch: Channel): number {
  return company.channels[ch].weight
}

function verified(company: CompanyProfile, ch: Channel): boolean {
  return company.channels[ch].verified
}

/** 信用情報系（CIC/JICC）のうち、その会社が最も強く参照するチャネルの重み */
function creditWeight(company: CompanyProfile): { weight: number; channel: Channel } {
  const cic = w(company, 'cic')
  const jicc = w(company, 'jicc')
  return cic >= jicc ? { weight: cic, channel: 'cic' } : { weight: jicc, channel: 'jicc' }
}

/**
 * 理由を1件積む。
 * points が 0 のものは通常は捨てるが、info:true を付けたものは
 * 「なぜ影響しないのか」を営業に説明するために残す。
 */
function add(
  ctx: Ctx,
  r: Omit<Reason, 'unverified'> & { unverified?: boolean; info?: boolean },
) {
  if (r.points === 0 && !r.info) return
  const unverified = r.unverified ?? (r.channel ? !verified(ctx.company, r.channel) : false)
  if (unverified && r.points < 0) ctx.unverifiedBasis = true
  ctx.reasons.push({ ...r, unverified })
}

// ---------------------------------------------------------------------------
// ルール群
// ---------------------------------------------------------------------------

/** ① 当該保証会社での利用歴 — 自社DBは期限がなく、最も重い */
function ruleOwnHistory(ctx: Ctx) {
  const { company } = ctx
  const own = ctx.input.guaranteeHistory.filter((h) => h.companyKey === company.key)
  if (own.length === 0) return

  for (const h of own) {
    const when = h.yearsAgo == null ? '過去' : `${h.yearsAgo}年前`
    switch (h.status) {
      case 'legal':
        ctx.hardReject = true
        add(ctx, {
          ruleId: 'own_legal',
          text: `${company.name}で${when}に訴訟・明渡しに至った履歴があります（自社データに残り続けます）`,
          points: -100,
          channel: 'own',
        })
        break
      case 'subrogation':
        ctx.hardReject = true
        add(ctx, {
          ruleId: 'own_subrogation',
          text: `${company.name}で${when}に代位弁済（家賃の立替）に至った履歴があります。同じ会社への再申込は避けてください`,
          points: -100,
          channel: 'own',
        })
        break
      case 'late_serious':
        add(ctx, {
          ruleId: 'own_late_serious',
          text: `${company.name}で${when}に2ヶ月以上の家賃滞納歴があります`,
          points: h.resolved === 'yes' ? -55 : -70,
          channel: 'own',
        })
        break
      case 'late_minor':
        add(ctx, {
          ruleId: 'own_late_minor',
          text: `${company.name}で${when}に短期の家賃遅延歴があります`,
          points: -25,
          channel: 'own',
        })
        break
      case 'clean':
        add(ctx, {
          ruleId: 'own_clean',
          text: `${company.name}での利用歴があり、滞納はありません（プラス材料）`,
          points: +10,
          channel: 'own',
        })
        break
      case 'never':
        break
    }
  }
}

/** ② 他社保証会社での事故 — LICC / CGO / 参照経路なし で扱いが変わる */
function ruleOtherCompanyHistory(ctx: Ctx) {
  const { company } = ctx
  const others = ctx.input.guaranteeHistory.filter((h) => h.companyKey !== company.key)

  for (const h of others) {
    if (h.status === 'never' || h.status === 'clean') continue
    const other = COMPANY_MAP.get(h.companyKey)
    const otherName = other?.name ?? '他社保証会社'
    const when = h.yearsAgo == null ? '過去' : `${h.yearsAgo}年前`
    const severe = h.status === 'subrogation' || h.status === 'legal'

    // LICC経由で見える場合
    if (isLiccMember(h.companyKey) && w(company, 'licc') > 0) {
      const base = severe ? -100 : h.status === 'late_serious' ? -50 : -18
      const pts = Math.round(base * w(company, 'licc'))
      if (severe && w(company, 'licc') >= 0.8) ctx.hardReject = true
      add(ctx, {
        ruleId: severe ? 'licc_subrogation' : 'licc_late',
        text: `${otherName}（LICC加盟）で${when}に${labelOf(h)}があります。${company.name}はLICCの共有情報を参照するため影響します`,
        points: pts,
        channel: 'licc',
      })
      continue
    }

    // CGO経由（共有していないとされるため軽い）
    if (isCgoMember(h.companyKey) && w(company, 'cgo') > 0) {
      const base = severe ? -40 : -15
      add(ctx, {
        ruleId: 'cgo_history',
        text: `${otherName}（CGO加盟）で${when}に${labelOf(h)}があります。CGOは会員間で滞納情報を共有していないとされ、影響は限定的です`,
        points: Math.round(base * w(company, 'cgo')),
        channel: 'cgo',
      })
      continue
    }

    // 参照経路なし。申込書の過去利用歴欄から発覚しうる程度
    if (severe) {
      add(ctx, {
        ruleId: 'other_history_indirect',
        text: `${otherName}で${when}に${labelOf(h)}がありますが、${company.name}が参照する情報源には含まれません（申込書の記載内容からの発覚に留まります）`,
        points: -8,
        channel: null,
      })
    }
  }
}

function labelOf(h: GuaranteeHistoryEntry): string {
  switch (h.status) {
    case 'legal':
      return '訴訟・明渡し'
    case 'subrogation':
      return '代位弁済'
    case 'late_serious':
      return '2ヶ月以上の滞納'
    case 'late_minor':
      return '短期の遅延'
    default:
      return '利用歴'
  }
}

/** ③ 信用情報（本人申告） */
function ruleCredit(ctx: Ctx) {
  const { company, input } = ctx
  const c = input.credit
  const { weight, channel } = creditWeight(company)

  // 参照しない会社には、信用情報の減点を一切適用しない。
  // これが「日本セーフティーなら通る」を自動的に導く中核ロジック。
  if (weight === 0) {
    if (
      c.currentDelinquency === 'yes' ||
      c.seriousDelinquency === 'yes' ||
      (c.debtRestructuring !== 'none' && c.debtRestructuring !== 'unknown')
    ) {
      add(ctx, {
        ruleId: 'credit_not_referenced',
        text: `${company.name}は個人信用情報機関を参照しないため、クレジットカード等の情報は審査に影響しにくいと考えられます`,
        points: 0,
        channel: null,
        info: true,
      })
    }
    return
  }

  if (c.currentDelinquency === 'yes') {
    if (weight >= 0.8) ctx.hardReject = true
    add(ctx, {
      ruleId: 'credit_current_delinquency',
      text: '現在、支払いが遅れているものがあります（信用情報に「延滞中」として反映されます）',
      points: Math.round(-100 * weight),
      channel,
    })
  }

  if (c.seriousDelinquency === 'yes') {
    const years = c.seriousDelinquencyYearsAgo
    const expired = years != null && years >= 6
    if (expired) {
      add(ctx, {
        ruleId: 'credit_serious_expired',
        text: `${years}年前の長期延滞は、信用情報の保有期限（契約終了後5年）を過ぎており、記録が残っていない可能性が高いです`,
        points: -5,
        channel,
      })
    } else if (c.seriousDelinquencyResolved === 'yes') {
      add(ctx, {
        ruleId: 'credit_serious_resolved',
        text: `過去に61日以上（3ヶ月以上）の延滞があり完済済みです。完済はプラス材料ですが、記録は契約終了後5年間残ります`,
        points: Math.round(-50 * weight),
        channel,
      })
    } else {
      if (weight >= 0.8) ctx.hardReject = true
      add(ctx, {
        ruleId: 'credit_serious_unresolved',
        text: '過去に61日以上（3ヶ月以上）の延滞があり、完済が確認できていません（CICの「異動」に相当します）',
        points: Math.round(-100 * weight),
        channel,
      })
    }
  }

  // 債務整理
  if (c.debtRestructuring !== 'none' && c.debtRestructuring !== 'unknown') {
    const years = c.debtRestructuringYearsAgo
    const label =
      c.debtRestructuring === 'bankruptcy'
        ? '自己破産'
        : c.debtRestructuring === 'civil_rehab'
          ? '個人再生'
          : '任意整理'
    if (years != null && years >= 8) {
      add(ctx, {
        ruleId: 'debt_expired',
        text: `${years}年前の${label}は、信用情報の保有期限を過ぎており記録が残っていない可能性が高いです`,
        points: -5,
        channel,
      })
    } else if (years != null && years >= 6) {
      add(ctx, {
        ruleId: 'debt_borderline',
        text: `${years}年前の${label}です。記録が消えている可能性がありますが、機関・種別により差があるため確実ではありません`,
        points: Math.round(-30 * weight),
        channel,
      })
    } else {
      if (weight >= 0.8) ctx.hardReject = true
      const base = c.debtRestructuring === 'voluntary' ? -90 : -100
      add(ctx, {
        ruleId: 'debt_recent',
        text: `${years == null ? '' : `${years}年前に`}${label}をされています（信用情報に「取引事実」として登録されます）`,
        points: Math.round(base * weight),
        channel,
      })
    }
  }

  // 携帯端末の分割払い — CIC中心の情報なので cic の重みを使う
  if (c.mobileInstallmentDelinquency === 'yes') {
    const mw = Math.max(w(company, 'cic'), w(company, 'jicc') * 0.6)
    if (mw >= 0.8) ctx.hardReject = true
    add(ctx, {
      ruleId: 'mobile_installment',
      text: '携帯・スマホ本体代金の分割払いに2ヶ月以上の遅れがあります。これは割賦契約としてCICに登録されるため、信販系の審査に直接影響します',
      points: Math.round(-95 * mw),
      channel: 'cic',
    })
  }

  if (c.utilityOnlyDelinquency === 'yes' && c.mobileInstallmentDelinquency !== 'yes') {
    add(ctx, {
      ruleId: 'utility_only',
      text: '携帯の通信料金のみの遅れは、信用情報機関には原則登録されないため影響は軽微です',
      points: -3,
      channel: null,
    })
  }

  // 借入件数
  if (c.borrowingCount === '4plus') {
    add(ctx, {
      ruleId: 'borrowing_4plus',
      text: '借入が4件以上あります（多重債務とみなされ、返済負担が重いと判断されやすい状態です）',
      points: Math.round(-28 * weight),
      channel,
    })
  } else if (c.borrowingCount === '3') {
    add(ctx, {
      ruleId: 'borrowing_3',
      text: '借入が3件あります',
      points: Math.round(-10 * weight),
      channel,
    })
  }

  // クレヒスなし
  if (c.noCreditHistory === 'yes') {
    add(ctx, {
      ruleId: 'no_credit_history',
      text: 'クレジット・ローンのご利用歴がありません（いわゆるスーパーホワイト）。判断材料がないため、信販系では保守的に見られる傾向があります',
      points: Math.round(-15 * weight),
      channel,
    })
  }

  // CIC クレジット・ガイダンス（任意申告）
  if (c.cicGuidanceBand === 'low') {
    add(ctx, {
      ruleId: 'guidance_low',
      text: 'CICクレジット・ガイダンスのスコアが低い帯とのご申告です',
      points: Math.round(-25 * weight),
      channel: 'cic',
    })
  } else if (c.cicGuidanceBand === 'high') {
    add(ctx, {
      ruleId: 'guidance_high',
      text: 'CICクレジット・ガイダンスのスコアが高い帯とのご申告です（プラス材料）',
      points: Math.round(+8 * weight),
      channel: 'cic',
    })
  }
}

/** ④ 支払能力・属性 — 全社共通。独立系ではここが審査の中心になる */
function ruleCapacity(ctx: Ctx) {
  const { applicant: a } = ctx.input
  const { company } = ctx
  const isShinpan = company.category === 'shinpan'
  const referencesCredit = creditWeight(company).weight > 0

  // 家賃負担率
  if (a.annualIncomeManYen != null && a.annualIncomeManYen > 0 && a.monthlyRentYen > 0) {
    const monthlyIncome = (a.annualIncomeManYen * 10000) / 12
    const ratio = a.monthlyRentYen / monthlyIncome
    const pct = Math.round(ratio * 100)
    if (ratio > 0.4) {
      add(ctx, {
        ruleId: 'rent_ratio_over40',
        text: `家賃が月収の約${pct}%です（目安の33%を大きく超えています）`,
        points: -32,
        channel: null,
      })
    } else if (ratio > 0.33) {
      add(ctx, {
        ruleId: 'rent_ratio_over33',
        text: `家賃が月収の約${pct}%です（目安の33%を超えています）`,
        points: -16,
        channel: null,
      })
    } else if (ratio <= 0.25) {
      add(ctx, {
        ruleId: 'rent_ratio_good',
        text: `家賃が月収の約${pct}%に収まっており、支払能力面は良好です`,
        points: +8,
        channel: null,
      })
    }
  }

  // 雇用形態
  const empPenalty: Record<string, number> = {
    fulltime: 0,
    executive: 0,
    contract: -6,
    dispatch: -8,
    parttime: -14,
    selfemployed: -10,
    pension: -10,
    student: -12,
    unemployed: -38,
    welfare: isShinpan ? -45 : -16,
  }
  const empLabel: Record<string, string> = {
    contract: '契約社員',
    dispatch: '派遣社員',
    parttime: 'パート・アルバイト',
    selfemployed: '自営業・フリーランス',
    pension: '年金受給',
    student: '学生',
    unemployed: '無職',
    welfare: '生活保護受給',
  }
  const p = empPenalty[a.employment] ?? 0
  if (p !== 0) {
    const extra =
      a.employment === 'welfare' && !isShinpan
        ? '（代理納付の利用で通過するケースがあります）'
        : a.employment === 'student' && a.hasGuarantor
          ? '（連帯保証人ありで補えます）'
          : ''
    add(ctx, {
      ruleId: `employment_${a.employment}`,
      text: `雇用形態が${empLabel[a.employment]}です${extra}`,
      points: p,
      channel: null,
    })
  }

  // 勤続年数
  if (a.tenureMonths != null && a.tenureMonths < 6 && a.employment !== 'unemployed') {
    add(ctx, {
      ruleId: 'tenure_short',
      text: `勤続${a.tenureMonths}ヶ月と短く、収入の安定性が確認しにくい状態です`,
      points: -10,
      channel: null,
    })
  }

  // 緊急連絡先 — 全社共通で必須級
  if (a.emergencyContact === 'none') {
    add(ctx, {
      ruleId: 'no_emergency_contact',
      text: '緊急連絡先が確保できていません。ほぼ全ての保証会社で必須とされ、単独で否認理由になります',
      points: -55,
      channel: null,
    })
  } else if (a.emergencyContact === 'friend') {
    add(ctx, {
      ruleId: 'emergency_contact_friend',
      text: '緊急連絡先がご友人です。親族を立てられると通過率が上がります',
      points: -10,
      channel: null,
    })
  }

  if (!a.ownMobilePhone) {
    add(ctx, {
      ruleId: 'no_own_mobile',
      text: '本人名義の携帯電話がありません。本人確認が取りにくく、全社で不利に働きます',
      points: -18,
      channel: null,
    })
  }

  if (a.nationality === 'foreign' && a.residenceMonthsLeft != null && a.residenceMonthsLeft < 12) {
    add(ctx, {
      ruleId: 'residence_short',
      text: `在留期限まで${a.residenceMonthsLeft}ヶ月です。契約期間との関係で条件が付く場合があります`,
      points: -12,
      channel: null,
    })
  }

  if (a.hasGuarantor) {
    add(ctx, {
      ruleId: 'guarantor_present',
      text: '連帯保証人を立てられます（△判定を覆す最も効果的な補強材料です）',
      points: +12,
      channel: null,
    })
  }

  if (a.savingsMonths != null && a.savingsMonths >= 6) {
    add(ctx, {
      ruleId: 'savings_ok',
      text: `家賃${a.savingsMonths}ヶ月分の預貯金があり、残高証明で補強できます`,
      points: +8,
      channel: null,
    })
  }

  if (referencesCredit && ctx.input.credit.noCreditHistory === 'no' && !hasAnyCreditIssue(ctx)) {
    add(ctx, {
      ruleId: 'credit_clean',
      text: '信用情報上、大きな問題のご申告はありません',
      points: +6,
      channel: null,
    })
  }
}

function hasAnyCreditIssue(ctx: Ctx): boolean {
  const c = ctx.input.credit
  return (
    c.currentDelinquency === 'yes' ||
    c.seriousDelinquency === 'yes' ||
    c.mobileInstallmentDelinquency === 'yes' ||
    (c.debtRestructuring !== 'none' && c.debtRestructuring !== 'unknown') ||
    c.borrowingCount === '4plus'
  )
}

/** ⑤ 情報不足の検出 — 「わからない」を握りつぶさない */
function ruleMissingInfo(ctx: Ctx) {
  const { company, input } = ctx
  const c = input.credit
  const { weight } = creditWeight(company)

  if (input.applicant.annualIncomeManYen == null) {
    ctx.missing.push('年収（または月収）')
  }

  if (weight > 0) {
    if (c.seriousDelinquency === 'unknown') {
      ctx.missing.push('過去5年以内に61日以上／3ヶ月以上の支払遅延があったか')
    }
    if (c.debtRestructuring === 'unknown') {
      ctx.missing.push('債務整理・自己破産の有無と時期')
    }
    if (c.currentDelinquency === 'unknown') {
      ctx.missing.push('現在支払いが遅れているものがあるか')
    }
  }
  if (w(company, 'cic') > 0 && c.mobileInstallmentDelinquency === 'unknown') {
    ctx.missing.push('携帯・スマホ本体代金の分割払いに2ヶ月以上の遅れがあったか')
  }
  if (w(company, 'licc') > 0 && !input.guaranteeHistoryAsked) {
    ctx.missing.push('過去に利用した保証会社と、その支払状況')
  }
  if (company.channels.own.weight > 0 && !input.guaranteeHistoryAsked) {
    ctx.missing.push(`${company.name}の利用歴の有無`)
  }
}

/** その会社を判定するのに必要な情報が根本的に足りているか */
function hasEnoughToJudge(ctx: Ctx): boolean {
  const { input, company } = ctx
  const knowsCapacity =
    input.applicant.annualIncomeManYen != null || input.applicant.employment === 'welfare'
  const knowsHistory = input.guaranteeHistoryAsked
  const c = input.credit
  const knowsCredit =
    c.seriousDelinquency !== 'unknown' ||
    c.currentDelinquency !== 'unknown' ||
    c.debtRestructuring !== 'unknown'

  // 信用情報を見ない会社は、支払能力と利用歴が分かっていれば判定できる
  if (creditWeight(company).weight === 0) return knowsCapacity && knowsHistory
  return knowsCapacity && knowsHistory && knowsCredit
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

export function assessCompany(input: AssessmentInput, company: CompanyProfile): CompanyAssessment {
  const ctx: Ctx = {
    input,
    company,
    reasons: [],
    missing: [],
    hardReject: false,
    unverifiedBasis: false,
  }

  ruleOwnHistory(ctx)
  ruleOtherCompanyHistory(ctx)
  ruleCredit(ctx)
  ruleCapacity(ctx)
  ruleMissingInfo(ctx)

  const missing = [...new Set(ctx.missing)]
  const reasons = [...ctx.reasons].sort((a, b) => a.points - b.points)

  if (!hasEnoughToJudge(ctx)) {
    return {
      companyKey: company.key,
      companyName: company.name,
      category: company.category,
      grade: '？',
      score: 0,
      reasons,
      missingInfo: missing,
      hasUnverifiedBasis: ctx.unverifiedBasis,
      note: company.note,
    }
  }

  const raw = ctx.reasons.reduce((acc, r) => acc + r.points, 100)
  let score = ctx.hardReject ? Math.min(raw, 20) : raw
  score = Math.max(0, Math.min(100, score))

  // 情報不足がある場合、良い判定は出さない（△に丸める）
  if (missing.length > 0 && score > UNKNOWN_CAP) {
    score = UNKNOWN_CAP
    reasons.push({
      ruleId: 'capped_by_missing_info',
      text: `未確認の項目があるため、○以上の判定は保留しています（${missing.length}件の追加ヒアリングが必要です）`,
      points: 0,
      channel: null,
      unverified: false,
    })
  }

  return {
    companyKey: company.key,
    companyName: company.name,
    category: company.category,
    grade: gradeFromScore(score),
    score,
    reasons,
    missingInfo: missing,
    hasUnverifiedBasis: ctx.unverifiedBasis,
    note: company.note,
  }
}

const GRADE_ORDER: Record<Grade, number> = { '◎': 0, '○': 1, '△': 2, '×': 3, '？': 4 }

export function assess(input: AssessmentInput, companies: CompanyProfile[] = COMPANIES): AssessmentResult {
  const assessments = companies
    .map((c) => assessCompany(input, c))
    .sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || b.score - a.score)

  const globalMissingInfo = [...new Set(assessments.flatMap((a) => a.missingInfo))]

  return {
    assessments,
    globalMissingInfo,
    recommendation: buildRecommendation(assessments, globalMissingInfo),
  }
}

function buildRecommendation(assessments: CompanyAssessment[], missing: string[]): string {
  const best = assessments.filter((a) => a.grade === '◎' || a.grade === '○')
  const caution = assessments.filter((a) => a.grade === '△')
  const reject = assessments.filter((a) => a.grade === '×')

  if (missing.length > 0 && best.length === 0 && caution.length === 0) {
    return `判定に必要な情報が不足しています。次の項目をヒアリングしてください：${missing.join('、')}`
  }
  const parts: string[] = []
  if (best.length > 0) {
    parts.push(`${best.map((a) => a.companyName).join('・')}を優先してお申込みください。`)
  } else if (caution.length > 0) {
    parts.push(
      `確実に通る見込みの会社はありません。${caution.map((a) => a.companyName).join('・')}に、` +
        `連帯保証人・預金残高証明・前家賃などの補強材料を添えてお申込みください。`,
    )
  } else {
    parts.push('現在の条件では、対象8社いずれも通過可能性が低い判定です。物件の家賃帯の見直しをご検討ください。')
  }
  if (reject.length > 0) {
    parts.push(`${reject.map((a) => a.companyName).join('・')}への申込は避けてください。`)
  }
  if (missing.length > 0) {
    parts.push(`なお、${missing.join('、')}が未確認のため、判定は保守的に出しています。`)
  }
  return parts.join('')
}
