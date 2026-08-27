import type { ChannelRef, CompanyProfile } from './types'

/**
 * 保証会社ごとの「どの情報源を見るか」定義。
 *
 * 【運用ルール】
 * このファイルは調査結果そのものであり、コードロジックではない。
 * 各社の同意条項を一次確認できたら、`access` / `weight` / `verified` / `confidence`
 * を書き換えるだけでよい。判定ロジック（rules.ts / engine.ts）は変更不要。
 *
 * 調査根拠と検証ステータス → docs/guarantee/01-credit-bureau-research.md
 */

const NO: ChannelRef = { access: 'no', weight: 0, confidence: 'high', verified: true }

/** 参照しないが、申込書の自己申告欄から間接的に発覚しうる度合い */
const INDIRECT: ChannelRef = {
  access: 'no',
  weight: 0.15,
  confidence: 'medium',
  verified: false,
  note: '直接照会はしないが、申込書の過去利用歴欄・在籍確認から発覚しうる',
}

const OWN_DB: ChannelRef = {
  access: 'yes',
  weight: 1,
  confidence: 'high',
  verified: true,
  note: '自社の顧客データベース。保存期限の定めがなく、実質的に残り続ける',
}

export const COMPANIES: CompanyProfile[] = [
  // -------------------------------------------------------------------------
  // 信販系
  // -------------------------------------------------------------------------
  {
    key: 'epos',
    name: 'エポス',
    category: 'shinpan',
    channels: {
      cic: {
        access: 'yes',
        weight: 1,
        confidence: 'high',
        verified: true,
        sources: ['https://www.eposcard.co.jp/about/agency.html'],
        note: '同意条項にCICへの提供項目（支払状況・延滞等）まで明記',
      },
      jicc: {
        access: 'yes',
        weight: 1,
        confidence: 'high',
        verified: true,
        sources: ['https://www.eposcard.co.jp/rule/include/e_cre_rule01.html'],
        note: '同意条項にJICCへの提供項目（債務整理・破産申立等の取引事実）まで明記',
      },
      licc: NO,
      cgo: NO,
      own: OWN_DB,
    },
    note:
      '8社中もっとも信用情報の影響が大きい。ROOM iDは「立替払委託契約兼保証委託契約」であり、' +
      'カード審査と同じ与信取引。CICに異動がある方はまず候補から外す。',
    sources: [
      'https://www.eposcard.co.jp/room_id/',
      'https://www.eposcard.co.jp/about/agency.html',
      'https://www.eposcard.co.jp/rule/include/e_cre_rule01.html',
    ],
  },
  {
    key: 'orico',
    name: 'オリコ',
    category: 'shinpan',
    channels: {
      cic: {
        access: 'yes',
        weight: 1,
        confidence: 'high',
        verified: true,
        sources: ['https://www.orico.co.jp/terms/privacy/treat/'],
        note: '個人情報の取扱いに関する条項で、加盟機関への照会を明記',
      },
      jicc: {
        access: 'possible',
        weight: 0.5,
        confidence: 'low',
        verified: false,
        note: '加盟機関の正確なリストは「利用目的・開示制度等の公表について」で要確認',
      },
      licc: NO,
      cgo: NO,
      own: OWN_DB,
    },
    note: '信販系。CIC参照は確実。JICC・KSCの併用有無は要確認だが、判定結果への影響は小さい。',
    sources: [
      'https://www.orico.co.jp/terms/privacy/treat/',
      'https://www.orico.co.jp/terms/privacy/purpose/',
    ],
  },
  {
    key: 'saison',
    name: 'セゾン',
    category: 'shinpan',
    channels: {
      cic: {
        access: 'likely',
        weight: 0.9,
        confidence: 'medium',
        verified: false,
        note: '提供主体がクレディセゾン本体（信販会社）。Rent Quick固有の同意条項は要確認',
      },
      jicc: {
        access: 'likely',
        weight: 0.9,
        confidence: 'medium',
        verified: false,
        note: '同上',
      },
      licc: NO,
      cgo: NO,
      own: OWN_DB,
    },
    note:
      'セゾンの家賃保証 Rent Quick。クレディセゾン本体が提供し、セゾンカード発行を伴う設計。' +
      'エポスと同等の信販系として扱うのが安全。',
    sources: [
      'https://www.saisoncard.co.jp/rentquick/',
      'https://www.saisoncard.co.jp/rentquick/download/pdf/1_8_goannai.pdf',
    ],
  },

  // -------------------------------------------------------------------------
  // 協会系（LICC）
  // -------------------------------------------------------------------------
  {
    key: 'els',
    name: 'エルズサポート',
    category: 'licc',
    channels: {
      cic: INDIRECT,
      jicc: {
        access: 'yes',
        weight: 1,
        confidence: 'high',
        verified: true,
        sources: ['https://www.ls-support.co.jp/news/1528/'],
        note:
          '自社の「個人信用情報機関への誤登録に関するお詫び」で、JICCに顧客の取引情報を' +
          '登録している旨を明示。支払未収残高があると登録されうることも読み取れる',
      },
      licc: {
        access: 'likely',
        weight: 0.9,
        confidence: 'medium',
        verified: false,
        sources: ['https://jpg.or.jp/member02.html'],
        note: 'LICC会員一覧に掲載',
      },
      cgo: NO,
      own: OWN_DB,
    },
    note:
      '「協会系だから信用情報は見られない」は誤り。JICC登録・照会を前提に判断すること。' +
      'LICCとJICCの二重で見えるため、協会系の中では厳しめ。',
    sources: ['https://www.ls-support.co.jp/news/1528/', 'https://jpg.or.jp/member02.html'],
  },
  {
    key: 'zenhoren',
    name: '全保連',
    category: 'licc',
    channels: {
      cic: INDIRECT,
      jicc: {
        access: 'possible',
        weight: 0.5,
        confidence: 'low',
        verified: false,
        note:
          '2022年6月にJICC加盟との指摘が複数の二次情報にあるが公式未確認。' +
          '2025年4月22日改訂の同意書PDFで要確認（最優先の確認事項）',
      },
      licc: {
        access: 'likely',
        weight: 0.9,
        confidence: 'medium',
        verified: false,
        sources: ['https://jpg.or.jp/member02.html'],
      },
      cgo: NO,
      own: OWN_DB,
    },
    note:
      '要確認No.1。JICCを見るかどうかで判定が○↔×まで振れる。' +
      '確定するまでは weight 0.5 で運用し、該当ケースは△に丸めて「※要確認」を表示する。',
    sources: [
      'https://www.zenhoren.jp/consent/',
      'https://www.zenhoren.jp/news/858bbbb2be8245391ba033d69f3373f0.pdf',
      'https://jpg.or.jp/member02.html',
    ],
  },
  {
    key: 'nipponinsure',
    name: '日本インシュア（ニッポンインシュア）',
    category: 'licc',
    channels: {
      cic: INDIRECT,
      jicc: {
        access: 'possible',
        weight: 0.4,
        confidence: 'low',
        verified: false,
        note: '加盟の指摘があるが公式未確認',
      },
      licc: {
        access: 'likely',
        weight: 0.9,
        confidence: 'medium',
        verified: false,
        sources: ['https://jpg.or.jp/member02.html'],
      },
      cgo: {
        access: 'likely',
        weight: 0.3,
        confidence: 'low',
        verified: false,
        sources: ['https://www.cgo.or.jp/member.html'],
        note: 'CGO会員でもあるが、CGOは会員間で滞納情報を共有していないとされる（要一次確認）',
      },
      own: OWN_DB,
    },
    note:
      'LICCとCGOの両方に属する。LICC経由で他社の代位弁済歴が見えるため「協会系だから緩い」とは言えない。' +
      '正式名称はニッポンインシュア株式会社（福岡）。',
    sources: ['https://www.nipponinsure.jp/', 'https://jpg.or.jp/member02.html'],
  },

  // -------------------------------------------------------------------------
  // CGO系 / 独立系
  // -------------------------------------------------------------------------
  {
    key: 'casa',
    name: 'Casa',
    category: 'cgo',
    channels: {
      cic: {
        access: 'possible',
        weight: 0.25,
        confidence: 'low',
        verified: false,
        note: '個人情報取扱規程で「提携信用情報機関」として記載。実務での照会頻度は不明',
      },
      jicc: {
        access: 'likely',
        weight: 0.5,
        confidence: 'medium',
        verified: false,
        note:
          '個人情報取扱規程で「加盟信用情報機関＝JICC」と明記。' +
          'ただし実務は自社DB・自社基準を優先しているとの観測が多く、weightを半減させている',
      },
      licc: NO,
      cgo: {
        access: 'likely',
        weight: 0.25,
        confidence: 'low',
        verified: false,
        note: 'CGOは会員間で滞納情報を共有していないとされる（要一次確認）',
      },
      own: OWN_DB,
    },
    note:
      '「独立系」と説明されがちだが、規程上はJICC加盟・CIC/KSC提携。' +
      '照会できる建付けはあるが毎回フル照会しているとは限らない、というのが実態に近い。' +
      'weightは申込実績が溜まった段階で実データから補正すべき値。',
    sources: [
      'https://casa-inc.co.jp/privacy/',
      'https://casa-inc.co.jp/wp/wp-content/uploads/2022/07/個人情報取扱規程.pdf',
      'https://www.cgo.or.jp/member.html',
    ],
  },
  {
    key: 'nihonsafety',
    name: '日本セーフティー',
    category: 'independent',
    channels: {
      cic: NO,
      jicc: NO,
      licc: NO,
      cgo: {
        access: 'likely',
        weight: 0.25,
        confidence: 'low',
        verified: false,
        note: 'CGO会員。ただし会員間の滞納情報共有はないとされる（要一次確認）',
      },
      own: OWN_DB,
    },
    note:
      '同意条項が「契約期間中に当社が新たに信用情報機関に加盟した場合には…登録、利用する」' +
      'という条件形であり、現時点で個人信用情報機関に未加盟である可能性が高い。' +
      '信用情報に事故があるお客様の最有力候補。その分、収入・雇用形態・家賃比率が審査の中心になる。',
    sources: [
      'https://www.nihon-safety.co.jp/policy/policy_sub3/',
      'https://www.nihon-safety.co.jp/company/',
    ],
  },
]

export const COMPANY_MAP = new Map(COMPANIES.map((c) => [c.key, c]))

/** LICC加盟社かどうか（他社履歴の横断判定に使う） */
export function isLiccMember(companyKey: string): boolean {
  if (companyKey === 'other_licc') return true
  return COMPANY_MAP.get(companyKey)?.channels.licc.access !== 'no'
}

/** CGO加盟社かどうか */
export function isCgoMember(companyKey: string): boolean {
  if (companyKey === 'other_cgo') return true
  return COMPANY_MAP.get(companyKey)?.channels.cgo.access !== 'no'
}
