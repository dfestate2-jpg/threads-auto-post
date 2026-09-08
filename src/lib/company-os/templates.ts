/**
 * プロジェクトのテンプレート。
 *
 * 会社を立ち上げる人が最初に困るのは「何をやればいいのか分からない」ことで、
 * 空のタスク一覧を渡しても前に進まない。ボタン1つで、やるべきことが
 * 順番と期限つきで並ぶ状態を作る。
 *
 * ここは定義（データ）だけ。DBへの書き込みは services/companyOs/template.ts。
 * 依存関係は key で書く。ID を知らなくても順序を定義できるようにするため。
 */
import type { CoArea, CoPriority } from '@prisma/client'

export interface TemplateTask {
  /** テンプレート内で一意。二重生成の判定にも使う */
  key: string
  title: string
  area: CoArea
  priority: CoPriority
  description?: string
  /** 開始日から何日後を期限にするか */
  offsetDays: number
  /** 先行タスクの key */
  dependsOn?: string[]
  checklist?: string[]
  revenueImpact?: number
  riskImpact?: number
}

export interface TemplateMilestone {
  name: string
  offsetDays: number
}

export interface ProjectTemplate {
  key: string
  name: string
  description: string
  icon: string
  area: CoArea
  milestones: TemplateMilestone[]
  tasks: TemplateTask[]
}

const T = (
  key: string,
  title: string,
  area: CoArea,
  offsetDays: number,
  priority: CoPriority = 'MEDIUM',
  extra: Partial<TemplateTask> = {},
): TemplateTask => ({ key, title, area, offsetDays, priority, ...extra })

/**
 * 会社立ち上げ。
 *
 * 幹となる流れは
 *   会社設計 → 登記 → 法人口座 → 会計 → 営業資料 → 商品完成 → 初回営業 → 初回契約
 * で、この8つは依存関係でつないである。残りは各段階にぶら下がる枝。
 */
export const STARTUP_TEMPLATE: ProjectTemplate = {
  key: 'startup',
  name: '会社立ち上げ',
  description: '会社設計から初回契約までを、順番と期限つきで管理する',
  icon: '🚀',
  area: 'COMPANY',
  milestones: [
    { name: '会社設計の確定', offsetDays: 14 },
    { name: '法人登記の完了', offsetDays: 30 },
    { name: '営業開始の準備完了', offsetDays: 60 },
    { name: '初回契約', offsetDays: 120 },
  ],
  tasks: [
    // --- 会社設計：ここが決まらないと登記に進めない ---
    T('company_name', '会社名を決める', 'COMPANY', 3, 'TOP', {
      description: '商号の重複・ドメインの空き・読みやすさを確認してから確定する',
      checklist: ['候補を3つ出す', '登記所で類似商号を確認', 'ドメインの空きを確認', '最終決定'],
      riskImpact: 2,
    }),
    T('company_address', '本店所在地を決める', 'COMPANY', 5, 'HIGH', {
      checklist: ['自宅／レンタルオフィス／賃貸を比較', '登記可能か確認', '契約'],
    }),
    T('representative', '代表者を決める', 'COMPANY', 3, 'TOP'),
    T('officers', '役員構成を決める', 'COMPANY', 5, 'HIGH', { dependsOn: ['representative'] }),
    T('shareholders', '株主・出資比率を決める', 'COMPANY', 5, 'TOP', {
      description: '後から変えるのが最も難しい項目。もめない比率を最初に決めきる',
      dependsOn: ['representative'],
      riskImpact: 3,
    }),
    T('capital', '資本金を決める', 'COMPANY', 7, 'HIGH', { dependsOn: ['shareholders'] }),
    T('purpose', '事業目的を決める', 'COMPANY', 7, 'HIGH', {
      description: '将来やる可能性のある事業も入れておく（後から変更すると登記費用がかかる）',
      dependsOn: ['company_name'],
    }),
    T('articles', '定款を作成する', 'LEGAL', 12, 'HIGH', {
      dependsOn: ['company_name', 'company_address', 'officers', 'capital', 'purpose'],
      checklist: ['定款の草案作成', '専門家レビュー', '電子定款の認証'],
      riskImpact: 2,
    }),

    // --- 法務：登記から各種届出まで ---
    T('registration', '法人登記を申請する', 'LEGAL', 18, 'TOP', {
      dependsOn: ['articles'],
      description: '登記完了日が会社の設立日になる',
      riskImpact: 3,
    }),
    T('company_seal', '法人印を作成する', 'LEGAL', 14, 'MEDIUM', { dependsOn: ['company_name'] }),
    T('seal_certificate', '印鑑証明を取得する', 'LEGAL', 22, 'MEDIUM', { dependsOn: ['registration', 'company_seal'] }),
    T('bank_account', '法人口座を開設する', 'FINANCE', 30, 'TOP', {
      dependsOn: ['registration', 'seal_certificate'],
      description: '審査に2〜4週間かかることがある。事業計画を求められる前提で準備する',
      checklist: ['ネット銀行に申込', 'メガバンク／地銀に申込', '事業計画書を提出', '口座開設完了'],
      riskImpact: 3,
    }),
    T('tax_office', '税務署へ届け出る', 'LEGAL', 32, 'HIGH', {
      dependsOn: ['registration'],
      checklist: ['法人設立届出書', '青色申告の承認申請', '給与支払事務所等の開設届'],
      riskImpact: 2,
    }),
    T('social_insurance', '社会保険の手続きをする', 'LEGAL', 35, 'HIGH', { dependsOn: ['registration'] }),
    T('labor_insurance', '労働保険の手続きをする', 'LEGAL', 40, 'MEDIUM', { dependsOn: ['social_insurance'] }),

    // --- 経営：数字と役割 ---
    T('business_plan', '事業計画を作る', 'MANAGEMENT', 20, 'HIGH', {
      description: '融資・補助金・銀行口座のすべてで提出を求められる',
      revenueImpact: 2,
    }),
    T('product_design', '商品を設計する', 'BUSINESS', 25, 'TOP', {
      dependsOn: ['business_plan'],
      revenueImpact: 3,
    }),
    T('pricing', '価格を決める', 'BUSINESS', 30, 'HIGH', { dependsOn: ['product_design'], revenueImpact: 3 }),
    T('roles', '役割分担を決める', 'HR', 14, 'HIGH', { dependsOn: ['officers'] }),
    T('kpi', 'KPIを設定する', 'MANAGEMENT', 30, 'MEDIUM', { dependsOn: ['business_plan'] }),
    T('accounting', '会計体制を整える', 'FINANCE', 38, 'HIGH', {
      dependsOn: ['bank_account'],
      checklist: ['会計ソフトを契約', '銀行口座と連携', '税理士を決める', '仕訳ルールを決める'],
      riskImpact: 2,
    }),

    // --- 営業：売れる形にする ---
    T('sales_material', '営業資料を作る', 'SALES', 45, 'HIGH', {
      dependsOn: ['pricing', 'accounting'],
      revenueImpact: 3,
      checklist: ['会社紹介', 'サービス説明', '料金表', '導入事例の枠'],
    }),
    T('sales_list', '営業リストを作る', 'SALES', 45, 'HIGH', { dependsOn: ['product_design'], revenueImpact: 2 }),
    T('sales_method', '営業方法を決める', 'SALES', 45, 'MEDIUM', { dependsOn: ['sales_list'] }),
    T('crm', 'CRM（顧客管理）を用意する', 'SALES', 50, 'MEDIUM', { dependsOn: ['sales_list'] }),
    T('contract_form', '契約書のひな形を作る', 'LEGAL', 50, 'HIGH', {
      dependsOn: ['pricing'],
      description: '専門家のレビューを受ける。ここを省くと後で必ず問題になる',
      riskImpact: 3,
    }),
    T('quotation_form', '見積書のひな形を作る', 'SALES', 50, 'MEDIUM', { dependsOn: ['pricing'] }),

    // --- 開発：売るものを完成させる ---
    T('requirements', '要件定義をする', 'DEVELOPMENT', 35, 'HIGH', { dependsOn: ['product_design'] }),
    T('mvp', 'MVPを完成させる', 'DEVELOPMENT', 60, 'TOP', {
      dependsOn: ['requirements'],
      revenueImpact: 3,
    }),
    T('testing', 'テストする', 'DEVELOPMENT', 65, 'HIGH', { dependsOn: ['mvp'] }),
    T('demo_env', 'デモ環境を用意する', 'DEVELOPMENT', 68, 'HIGH', { dependsOn: ['mvp'], revenueImpact: 2 }),
    T('manual', 'マニュアルを作る', 'DEVELOPMENT', 72, 'MEDIUM', { dependsOn: ['mvp'] }),
    T('support', 'サポート体制を決める', 'CUSTOMER', 75, 'MEDIUM', { dependsOn: ['manual'] }),

    // --- 補助金 ---
    T('subsidy_search', '対象になる補助金を調べる', 'SUBSIDY', 30, 'MEDIUM'),
    T('subsidy_expert', '専門家を選ぶ', 'SUBSIDY', 40, 'MEDIUM', { dependsOn: ['subsidy_search'] }),
    T('subsidy_docs', '必要書類をそろえる', 'SUBSIDY', 50, 'MEDIUM', { dependsOn: ['subsidy_expert'] }),
    T('subsidy_apply', '申請を準備する', 'SUBSIDY', 60, 'MEDIUM', { dependsOn: ['subsidy_docs'] }),
    T('it_tool', 'ITツールとして登録する', 'SUBSIDY', 70, 'LOW', { dependsOn: ['subsidy_apply'] }),

    // --- 顧客：最初の1社まで ---
    T('lead_list', '初期の顧客候補を洗い出す', 'CUSTOMER', 55, 'HIGH', { dependsOn: ['sales_list'], revenueImpact: 2 }),
    T('hearing', 'ヒアリングする', 'CUSTOMER', 70, 'HIGH', { dependsOn: ['lead_list', 'sales_material'], revenueImpact: 2 }),
    T('first_sales', '初回営業をする', 'SALES', 85, 'TOP', {
      dependsOn: ['hearing', 'demo_env'],
      revenueImpact: 3,
    }),
    T('proposal', '提案する', 'SALES', 95, 'HIGH', { dependsOn: ['first_sales'], revenueImpact: 3 }),
    T('first_contract', '初回契約を締結する', 'SALES', 110, 'TOP', {
      dependsOn: ['proposal', 'contract_form'],
      revenueImpact: 3,
    }),
    T('onboarding', '導入する', 'CUSTOMER', 120, 'HIGH', { dependsOn: ['first_contract', 'support'] }),
    T('measure', '効果測定をする', 'CUSTOMER', 140, 'MEDIUM', { dependsOn: ['onboarding'] }),
  ],
}

/**
 * 会社買収（M&A）。
 * 買収は「調べる → 契約する → 引き継ぐ」の3段。
 * デューデリジェンスは抜けが致命傷になるため、チェックリストで潰す。
 */
export const MA_TEMPLATE: ProjectTemplate = {
  key: 'ma',
  name: '会社買収',
  description: 'デューデリジェンスから買収後の引き継ぎまでを抜けなく進める',
  icon: '🔀',
  area: 'MA',
  milestones: [
    { name: 'DD完了', offsetDays: 45 },
    { name: '株式譲渡契約の締結', offsetDays: 60 },
    { name: '引き継ぎ完了', offsetDays: 120 },
  ],
  tasks: [
    T('ma_nda', '秘密保持契約を締結する', 'MA', 3, 'TOP', { riskImpact: 3 }),
    T('ma_dd_legal', 'DD：登記・株主・許認可を確認する', 'MA', 20, 'TOP', {
      dependsOn: ['ma_nda'],
      checklist: ['登記簿謄本', '株主名簿', '定款', '許認可の一覧と有効期限', '訴訟の有無'],
      riskImpact: 3,
    }),
    T('ma_dd_finance', 'DD：決算書・税務・借入を確認する', 'MA', 25, 'TOP', {
      dependsOn: ['ma_nda'],
      checklist: ['直近3期の決算書', '税務申告書', '借入金の残高と条件', '未払金', '未収金', 'リース契約'],
      riskImpact: 3,
    }),
    T('ma_dd_contract', 'DD：契約関係を確認する', 'MA', 30, 'HIGH', {
      dependsOn: ['ma_nda'],
      checklist: ['取引先との契約', '賃貸借契約', '雇用契約', 'チェンジオブコントロール条項の有無'],
      riskImpact: 3,
    }),
    T('ma_dd_system', 'DD：システム・ドメイン・口座を確認する', 'MA', 35, 'HIGH', {
      dependsOn: ['ma_nda'],
      checklist: ['利用中のシステム一覧', 'ドメインの名義', '銀行口座', 'クラウドの管理者権限'],
      riskImpact: 2,
    }),
    T('ma_valuation', '譲渡価格を算定する', 'MA', 40, 'TOP', {
      dependsOn: ['ma_dd_finance'],
      revenueImpact: 3,
      riskImpact: 3,
    }),
    T('ma_spa', '株式譲渡契約を締結する', 'MA', 55, 'TOP', {
      dependsOn: ['ma_valuation', 'ma_dd_legal', 'ma_dd_contract'],
      checklist: ['譲渡価格', '譲渡日', '表明保証', '補償条項', '引き継ぎ条件'],
      riskImpact: 3,
    }),
    T('ma_closing', '決済・譲渡を実行する', 'MA', 60, 'TOP', { dependsOn: ['ma_spa'], riskImpact: 3 }),
    T('ma_representative', '代表者を変更する', 'MA', 70, 'HIGH', { dependsOn: ['ma_closing'] }),
    T('ma_officers', '役員を変更する', 'MA', 70, 'HIGH', { dependsOn: ['ma_closing'] }),
    T('ma_shareholders', '株主名簿を書き換える', 'MA', 65, 'HIGH', { dependsOn: ['ma_closing'] }),
    T('ma_bank', '銀行口座の名義・権限を変更する', 'MA', 80, 'HIGH', { dependsOn: ['ma_representative'], riskImpact: 2 }),
    T('ma_cancel', '不要な契約を解約する', 'MA', 90, 'MEDIUM', { dependsOn: ['ma_dd_contract', 'ma_closing'] }),
    T('ma_purpose', '事業目的を変更する', 'MA', 90, 'LOW', { dependsOn: ['ma_closing'] }),
    T('ma_website', 'ホームページを更新する', 'MA', 100, 'MEDIUM', { dependsOn: ['ma_representative'] }),
    T('ma_accounts', 'アカウント・権限を整理する', 'MA', 110, 'MEDIUM', {
      dependsOn: ['ma_dd_system', 'ma_closing'],
      riskImpact: 2,
    }),
  ],
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [STARTUP_TEMPLATE, MA_TEMPLATE]

export function findTemplate(key: string): ProjectTemplate | null {
  return PROJECT_TEMPLATES.find((t) => t.key === key) ?? null
}

/**
 * テンプレートの健全性チェック。
 * 依存先の key が存在しない・自分自身に依存する・循環している場合に問題を返す。
 * 循環したままタスクを作ると「永久に着手できないタスク」ができてしまう。
 */
export function validateTemplate(template: ProjectTemplate): string[] {
  const problems: string[] = []
  const keys = new Set(template.tasks.map((t) => t.key))
  if (keys.size !== template.tasks.length) problems.push('key が重複しています')

  for (const task of template.tasks) {
    for (const dep of task.dependsOn ?? []) {
      if (dep === task.key) problems.push(`${task.key}: 自分自身に依存しています`)
      else if (!keys.has(dep)) problems.push(`${task.key}: 依存先 ${dep} が存在しません`)
    }
  }

  // 深さ優先で循環を検出する
  const state = new Map<string, 'visiting' | 'done'>()
  const byKey = new Map(template.tasks.map((t) => [t.key, t]))
  const walk = (key: string): boolean => {
    const current = state.get(key)
    if (current === 'done') return false
    if (current === 'visiting') return true
    state.set(key, 'visiting')
    for (const dep of byKey.get(key)?.dependsOn ?? []) {
      if (byKey.has(dep) && walk(dep)) return true
    }
    state.set(key, 'done')
    return false
  }
  for (const task of template.tasks) {
    if (walk(task.key)) {
      problems.push(`${task.key}: 依存関係が循環しています`)
      break
    }
  }
  return problems
}
