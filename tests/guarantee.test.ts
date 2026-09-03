import { describe, expect, it } from 'vitest'
import { assess, assessCompany } from '@/lib/guarantee/engine'
import { COMPANY_MAP } from '@/lib/guarantee/companies'
import type { AssessmentInput, CreditSelfReport, Grade } from '@/lib/guarantee/types'

const cleanCredit: CreditSelfReport = {
  currentDelinquency: 'no',
  seriousDelinquency: 'no',
  seriousDelinquencyResolved: 'no',
  debtRestructuring: 'none',
  mobileInstallmentDelinquency: 'no',
  utilityOnlyDelinquency: 'no',
  borrowingCount: 'none',
  noCreditHistory: 'no',
}

function baseInput(over: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    applicant: {
      ageBand: '30s',
      nationality: 'jp',
      employment: 'fulltime',
      tenureMonths: 48,
      annualIncomeManYen: 480,
      monthlyRentYen: 90000,
      hasGuarantor: false,
      emergencyContact: 'family',
      ownMobilePhone: true,
      savingsMonths: null,
    },
    guaranteeHistory: [],
    guaranteeHistoryAsked: true,
    credit: { ...cleanCredit },
    ...over,
  }
}

function gradeOf(input: AssessmentInput, key: string): Grade {
  const company = COMPANY_MAP.get(key)
  if (!company) throw new Error(`unknown company: ${key}`)
  return assessCompany(input, company).grade
}

describe('健全な申込者', () => {
  it('全社で ○ 以上になる', () => {
    const result = assess(baseInput())
    for (const a of result.assessments) {
      expect(['◎', '○'], `${a.companyName} => ${a.grade}`).toContain(a.grade)
    }
  })

  it('連帯保証人・預貯金があると ◎ が出る', () => {
    const input = baseInput()
    input.applicant.hasGuarantor = true
    input.applicant.savingsMonths = 12
    const result = assess(input)
    expect(result.assessments.some((a) => a.grade === '◎')).toBe(true)
  })
})

describe('信用情報の事故は、参照する会社にだけ効く', () => {
  const input = baseInput()
  input.credit = {
    ...cleanCredit,
    seriousDelinquency: 'yes',
    seriousDelinquencyYearsAgo: 2,
    seriousDelinquencyResolved: 'no',
  }

  it('信販系（エポス）は × になる', () => {
    expect(gradeOf(input, 'epos')).toBe('×')
  })

  it('信販系（オリコ・セゾン）も × になる', () => {
    expect(gradeOf(input, 'orico')).toBe('×')
    expect(gradeOf(input, 'saison')).toBe('×')
  })

  it('JICC加盟のエルズサポートも × になる', () => {
    expect(gradeOf(input, 'els')).toBe('×')
  })

  it('個人信用情報機関を参照しない日本セーフティーは影響を受けない', () => {
    expect(['◎', '○']).toContain(gradeOf(input, 'nihonsafety'))
  })

  it('Casa は weight 半減のため × ではなく △ に留まる', () => {
    expect(gradeOf(input, 'casa')).toBe('△')
  })

  it('参照しない会社には「影響しにくい」旨の理由が付く', () => {
    const a = assessCompany(input, COMPANY_MAP.get('nihonsafety')!)
    expect(a.reasons.some((r) => r.ruleId === 'credit_not_referenced')).toBe(true)
  })
})

describe('債務整理', () => {
  it('3年前の自己破産は信販系で ×、日本セーフティーでは影響しない', () => {
    const input = baseInput()
    input.credit = { ...cleanCredit, debtRestructuring: 'bankruptcy', debtRestructuringYearsAgo: 3 }
    expect(gradeOf(input, 'epos')).toBe('×')
    expect(['◎', '○']).toContain(gradeOf(input, 'nihonsafety'))
  })

  it('10年前の自己破産は保有期限切れとして全社で影響が消える', () => {
    const input = baseInput()
    input.credit = { ...cleanCredit, debtRestructuring: 'bankruptcy', debtRestructuringYearsAgo: 10 }
    expect(['◎', '○']).toContain(gradeOf(input, 'epos'))
  })
})

describe('完済の有無で1段階変わる', () => {
  function withDelinquency(resolved: 'yes' | 'no') {
    const input = baseInput()
    input.credit = {
      ...cleanCredit,
      seriousDelinquency: 'yes',
      seriousDelinquencyYearsAgo: 3,
      seriousDelinquencyResolved: resolved,
    }
    return assessCompany(input, COMPANY_MAP.get('epos')!)
  }

  it('未完済は ×、完済済みはスコアが上がる', () => {
    const unresolved = withDelinquency('no')
    const resolved = withDelinquency('yes')
    expect(unresolved.grade).toBe('×')
    expect(resolved.score).toBeGreaterThan(unresolved.score)
  })
})

describe('携帯端末の分割払い滞納', () => {
  const input = baseInput()
  input.credit = { ...cleanCredit, mobileInstallmentDelinquency: 'yes' }

  it('CICに載るため信販系は × になる', () => {
    expect(gradeOf(input, 'epos')).toBe('×')
    expect(gradeOf(input, 'orico')).toBe('×')
  })

  it('日本セーフティーは影響を受けない', () => {
    expect(['◎', '○']).toContain(gradeOf(input, 'nihonsafety'))
  })

  it('通信料金のみの滞納はほぼ影響しない', () => {
    const utilityOnly = baseInput()
    utilityOnly.credit = { ...cleanCredit, utilityOnlyDelinquency: 'yes' }
    expect(['◎', '○']).toContain(gradeOf(utilityOnly, 'epos'))
  })
})

describe('家賃滞納歴の伝播', () => {
  it('自社での代位弁済歴はその会社だけ × になる', () => {
    const input = baseInput({
      guaranteeHistory: [{ companyKey: 'casa', status: 'subrogation', yearsAgo: 3, resolved: 'yes' }],
    })
    expect(gradeOf(input, 'casa')).toBe('×')
    expect(['◎', '○']).toContain(gradeOf(input, 'nihonsafety'))
    expect(['◎', '○']).toContain(gradeOf(input, 'epos'))
  })

  it('LICC加盟社での代位弁済は、LICC参照社に横断で効く', () => {
    const input = baseInput({
      guaranteeHistory: [
        { companyKey: 'zenhoren', status: 'subrogation', yearsAgo: 2, resolved: 'yes' },
      ],
    })
    expect(gradeOf(input, 'zenhoren')).toBe('×') // 自社
    expect(gradeOf(input, 'els')).toBe('×') // LICC経由
    expect(gradeOf(input, 'nipponinsure')).toBe('×') // LICC経由
    expect(['◎', '○']).toContain(gradeOf(input, 'nihonsafety')) // LICC非会員
    expect(['◎', '○']).toContain(gradeOf(input, 'epos')) // LICC非会員
  })

  it('CGO系での滞納は他社に大きくは伝播しない', () => {
    const input = baseInput({
      guaranteeHistory: [
        { companyKey: 'nihonsafety', status: 'subrogation', yearsAgo: 2, resolved: 'yes' },
      ],
    })
    expect(gradeOf(input, 'nihonsafety')).toBe('×')
    expect(['◎', '○']).toContain(gradeOf(input, 'els'))
    expect(['◎', '○', '△']).toContain(gradeOf(input, 'casa'))
  })
})

describe('情報不足は ？ になる', () => {
  it('信用情報も利用歴も未ヒアリングなら、信販系は ？', () => {
    const input = baseInput({
      guaranteeHistoryAsked: false,
      credit: {
        ...cleanCredit,
        currentDelinquency: 'unknown',
        seriousDelinquency: 'unknown',
        debtRestructuring: 'unknown',
        mobileInstallmentDelinquency: 'unknown',
        borrowingCount: 'unknown',
        noCreditHistory: 'unknown',
      },
    })
    expect(gradeOf(input, 'epos')).toBe('？')
    expect(gradeOf(input, 'nihonsafety')).toBe('？') // 利用歴が未ヒアリングのため
  })

  it('利用歴だけ聞けていれば、信用情報を見ない日本セーフティーは判定できる', () => {
    const input = baseInput({
      guaranteeHistoryAsked: true,
      credit: {
        ...cleanCredit,
        currentDelinquency: 'unknown',
        seriousDelinquency: 'unknown',
        debtRestructuring: 'unknown',
        mobileInstallmentDelinquency: 'unknown',
      },
    })
    expect(gradeOf(input, 'nihonsafety')).not.toBe('？')
    expect(gradeOf(input, 'epos')).toBe('？')
  })

  it('一部だけ不明な場合は ○ 以上を出さず △ に丸め、ヒアリング項目を返す', () => {
    const input = baseInput({
      credit: { ...cleanCredit, mobileInstallmentDelinquency: 'unknown' },
    })
    const a = assessCompany(input, COMPANY_MAP.get('epos')!)
    expect(a.grade).toBe('△')
    expect(a.missingInfo.join()).toContain('携帯')
    expect(a.reasons.some((r) => r.ruleId === 'capped_by_missing_info')).toBe(true)
  })

  it('年収不明なら全社 ？', () => {
    const input = baseInput()
    input.applicant.annualIncomeManYen = null
    for (const a of assess(input).assessments) {
      expect(a.grade, a.companyName).toBe('？')
    }
  })
})

describe('支払能力', () => {
  it('緊急連絡先なしは単独で全社を下げる', () => {
    const input = baseInput()
    input.applicant.emergencyContact = 'none'
    for (const a of assess(input).assessments) {
      expect(['△', '×'], `${a.companyName} => ${a.grade}`).toContain(a.grade)
    }
  })

  it('家賃負担率が高いと下がる', () => {
    const input = baseInput()
    input.applicant.monthlyRentYen = 200000 // 年収480万 → 50%
    const a = assessCompany(input, COMPANY_MAP.get('nihonsafety')!)
    expect(a.reasons.some((r) => r.ruleId === 'rent_ratio_over40')).toBe(true)
    expect(['△', '×']).toContain(a.grade)
  })

  it('生活保護は信販系で厳しく、独立系では軽い', () => {
    const input = baseInput()
    input.applicant.employment = 'welfare'
    input.applicant.annualIncomeManYen = 150
    input.applicant.monthlyRentYen = 55000
    const epos = assessCompany(input, COMPANY_MAP.get('epos')!)
    const safety = assessCompany(input, COMPANY_MAP.get('nihonsafety')!)
    expect(safety.score).toBeGreaterThan(epos.score)
  })
})

describe('出力の性質', () => {
  it('全ての判定に理由が付く', () => {
    const input = baseInput()
    input.credit = { ...cleanCredit, seriousDelinquency: 'yes', seriousDelinquencyResolved: 'no' }
    for (const a of assess(input).assessments) {
      expect(a.reasons.length, a.companyName).toBeGreaterThan(0)
      for (const r of a.reasons) expect(r.text).not.toHaveLength(0)
    }
  })

  it('一次未確認の前提に依存した判定にはフラグが立つ', () => {
    const input = baseInput()
    input.credit = { ...cleanCredit, seriousDelinquency: 'yes', seriousDelinquencyResolved: 'no' }
    const casa = assessCompany(input, COMPANY_MAP.get('casa')!)
    expect(casa.hasUnverifiedBasis).toBe(true)
    const epos = assessCompany(input, COMPANY_MAP.get('epos')!)
    expect(epos.hasUnverifiedBasis).toBe(false)
  })

  it('結果は判定の良い順に並ぶ', () => {
    const input = baseInput()
    input.credit = { ...cleanCredit, seriousDelinquency: 'yes', seriousDelinquencyResolved: 'no' }
    const order = ['◎', '○', '△', '×', '？']
    const grades = assess(input).assessments.map((a) => order.indexOf(a.grade))
    expect(grades).toEqual([...grades].sort((a, b) => a - b))
  })

  it('推奨アクションが生成される', () => {
    const input = baseInput()
    input.credit = { ...cleanCredit, seriousDelinquency: 'yes', seriousDelinquencyResolved: 'no' }
    const r = assess(input)
    expect(r.recommendation).toContain('日本セーフティー')
  })
})
