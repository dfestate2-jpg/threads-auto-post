/**
 * 賃貸保証会社 事前審査シミュレーター — コンソールデモ
 *
 *   npx tsx scripts/guarantee-demo.ts
 *
 * 代表的な5ケースで、8社の判定がどう変わるかを確認できる。
 */
import { assess } from '../src/lib/guarantee/engine'
import type { AssessmentInput, CreditSelfReport } from '../src/lib/guarantee/types'

const CLEAN: CreditSelfReport = {
  currentDelinquency: 'no',
  seriousDelinquency: 'no',
  seriousDelinquencyResolved: 'no',
  debtRestructuring: 'none',
  mobileInstallmentDelinquency: 'no',
  utilityOnlyDelinquency: 'no',
  borrowingCount: 'none',
  noCreditHistory: 'no',
}

const UNKNOWN: CreditSelfReport = {
  currentDelinquency: 'unknown',
  seriousDelinquency: 'unknown',
  seriousDelinquencyResolved: 'unknown',
  debtRestructuring: 'unknown',
  mobileInstallmentDelinquency: 'unknown',
  utilityOnlyDelinquency: 'unknown',
  borrowingCount: 'unknown',
  noCreditHistory: 'unknown',
}

/** 全角を2幅として数え、コンソールの桁を揃える */
function displayWidth(s: string): number {
  let n = 0
  for (const ch of s) n += /[\u0000-\u00ff]/.test(ch) ? 1 : 2
  return n
}

function padWide(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)))
}

function input(over: Partial<AssessmentInput> = {}): AssessmentInput {
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
    credit: { ...CLEAN },
    ...over,
  }
}

const CASES: { title: string; input: AssessmentInput }[] = [
  {
    title: 'ケース1： 属性良好・信用情報も家賃滞納歴もなし',
    input: input(),
  },
  {
    title: 'ケース2： 3年前に61日以上の延滞（未完済）。家賃滞納歴はなし',
    input: input({
      credit: {
        ...CLEAN,
        seriousDelinquency: 'yes',
        seriousDelinquencyYearsAgo: 3,
        seriousDelinquencyResolved: 'no',
      },
    }),
  },
  {
    title: 'ケース3： 過去にCasaで家賃滞納。信用情報は問題なし',
    input: input({
      guaranteeHistory: [
        { companyKey: 'casa', status: 'late_serious', yearsAgo: 2, resolved: 'yes' },
      ],
    }),
  },
  {
    title: 'ケース4： 全保連（LICC加盟）で代位弁済歴あり',
    input: input({
      guaranteeHistory: [
        { companyKey: 'zenhoren', status: 'subrogation', yearsAgo: 2, resolved: 'yes' },
      ],
    }),
  },
  {
    title: 'ケース5： 信用情報を一切ヒアリングできていない（初回相談の電話口）',
    input: input({ credit: { ...UNKNOWN } }),
  },
]

for (const c of CASES) {
  const result = assess(c.input)
  console.log('\n' + '='.repeat(78))
  console.log(c.title)
  console.log('='.repeat(78))
  console.log(`推奨： ${result.recommendation}\n`)

  console.log(`${padWide('保証会社', 34)} 判定  点数  理由`)
  console.log('-'.repeat(100))
  for (const a of result.assessments) {
    const top = a.reasons[0]
    const mark = a.hasUnverifiedBasis ? '※' : '　'
    const score = a.grade === '？' ? ' -- ' : String(a.score).padStart(3) + ' '
    const reason = top ? top.text.slice(0, 40) : '（特記なし）'
    console.log(`${padWide(a.companyName, 34)} ${a.grade}${mark} ${score} ${reason}`)
  }
  if (result.globalMissingInfo.length > 0) {
    console.log('\n【追加ヒアリングが必要な項目】')
    for (const m of result.globalMissingInfo) console.log(`  ・${m}`)
  }
}
console.log()
