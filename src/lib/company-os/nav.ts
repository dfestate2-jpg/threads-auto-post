/**
 * サイドバーの構成。
 *
 * 経営に必要な領域をすべて並べる。まだ作っていない画面も隠さずに出し、
 * 開くと「これから作る場所」であることと、いま代わりに使える画面を案内する。
 * 隠してしまうと、経営者はこのアプリで何を管理できるのかを把握できない。
 */
export type NavPhase = 1 | 2 | 3

export interface NavItem {
  label: string
  href: string
  /** 実装済みの画面か。false ならこれから作る画面（開くと案内を出す） */
  ready: boolean
  phase: NavPhase
}

export interface NavGroup {
  label: string
  icon: string
  items: NavItem[]
}

export const NAV_ROOT = '/company-os'

const p = (path: string) => `${NAV_ROOT}${path}`

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '会社',
    icon: '🏢',
    items: [
      { label: '会社情報', href: p('/company'), ready: true, phase: 1 },
      { label: '設立タスク', href: p('/company/setup'), ready: true, phase: 1 },
      { label: '役員', href: p('/company/officers'), ready: true, phase: 1 },
      { label: '株主', href: p('/company/shareholders'), ready: true, phase: 1 },
      { label: '組織', href: p('/company/members'), ready: true, phase: 1 },
      { label: '会社目的', href: p('/company/purpose'), ready: true, phase: 1 },
      { label: '重要書類', href: p('/company/documents'), ready: true, phase: 1 },
    ],
  },
  {
    label: '経営',
    icon: '🧭',
    items: [
      { label: '経営目標', href: p('/management/objectives'), ready: true, phase: 1 },
      { label: 'KPI', href: p('/management/kpi'), ready: true, phase: 1 },
      { label: '経営課題', href: p('/issues'), ready: true, phase: 1 },
      { label: '意思決定', href: p('/decisions'), ready: true, phase: 1 },
      { label: '未決事項', href: p('/questions'), ready: true, phase: 1 },
      { label: '会議ログ', href: p('/meetings'), ready: true, phase: 1 },
    ],
  },
  {
    label: 'タスク',
    icon: '✅',
    items: [
      { label: 'すべて', href: p('/tasks'), ready: true, phase: 1 },
      { label: '今日', href: p('/tasks?view=today'), ready: true, phase: 1 },
      { label: '今週', href: p('/tasks?view=week'), ready: true, phase: 1 },
      { label: '期限超過', href: p('/tasks?view=overdue'), ready: true, phase: 1 },
      { label: '担当者別', href: p('/tasks?group=assignee'), ready: true, phase: 1 },
      { label: 'プロジェクト別', href: p('/tasks?group=project'), ready: true, phase: 1 },
    ],
  },
  {
    label: 'プロジェクト',
    icon: '📁',
    items: [
      { label: 'プロジェクト一覧', href: p('/projects'), ready: true, phase: 1 },
      { label: '進行状況', href: p('/projects?view=progress'), ready: true, phase: 1 },
      { label: 'マイルストーン', href: p('/projects?view=milestones'), ready: true, phase: 1 },
    ],
  },
  {
    label: '事業',
    icon: '📦',
    items: [
      { label: '事業モデル', href: p('/business/model'), ready: false, phase: 2 },
      { label: '商品', href: p('/business/products'), ready: false, phase: 2 },
      { label: '料金', href: p('/business/pricing'), ready: false, phase: 2 },
      { label: '事業計画', href: p('/business/plan'), ready: false, phase: 2 },
      { label: '売上目標', href: p('/business/revenue-target'), ready: false, phase: 2 },
    ],
  },
  {
    label: '営業',
    icon: '📣',
    items: [
      { label: '見込み顧客', href: p('/sales/leads'), ready: false, phase: 2 },
      { label: '商談', href: p('/sales/deals'), ready: false, phase: 2 },
      { label: '提案', href: p('/sales/proposals'), ready: false, phase: 2 },
      { label: '契約', href: p('/sales/contracts'), ready: false, phase: 2 },
      { label: '営業KPI', href: p('/sales/kpi'), ready: false, phase: 2 },
    ],
  },
  {
    label: '顧客',
    icon: '🤝',
    items: [
      { label: '顧客一覧', href: p('/customers'), ready: false, phase: 2 },
      { label: '導入状況', href: p('/customers/onboarding'), ready: false, phase: 2 },
      { label: '問い合わせ', href: p('/customers/inquiries'), ready: false, phase: 2 },
      { label: '改善要望', href: p('/customers/requests'), ready: false, phase: 2 },
    ],
  },
  {
    label: '開発',
    icon: '💻',
    items: [
      { label: '開発タスク', href: p('/tasks?area=DEVELOPMENT'), ready: true, phase: 1 },
      { label: '機能一覧', href: p('/development/features'), ready: false, phase: 2 },
      { label: 'バグ', href: p('/development/bugs'), ready: false, phase: 2 },
      { label: 'リリース', href: p('/development/releases'), ready: false, phase: 2 },
      { label: '開発ロードマップ', href: p('/development/roadmap'), ready: false, phase: 2 },
    ],
  },
  {
    label: '補助金',
    icon: '🎁',
    items: [
      { label: '補助金一覧', href: p('/subsidies'), ready: false, phase: 2 },
      { label: '申請案件', href: p('/subsidies/applications'), ready: false, phase: 2 },
      { label: '必要書類', href: p('/subsidies/documents'), ready: false, phase: 2 },
      { label: '期限', href: p('/subsidies/deadlines'), ready: false, phase: 2 },
      { label: '専門家', href: p('/subsidies/experts'), ready: false, phase: 2 },
    ],
  },
  {
    label: 'M&A',
    icon: '🔀',
    items: [
      { label: '買収案件', href: p('/projects?area=MA'), ready: true, phase: 1 },
      { label: 'DD', href: p('/tasks?area=MA'), ready: true, phase: 1 },
      { label: '契約', href: p('/ma/contracts'), ready: false, phase: 2 },
      { label: '引継ぎ', href: p('/ma/handover'), ready: false, phase: 2 },
      { label: '買収後タスク', href: p('/ma/post'), ready: false, phase: 2 },
    ],
  },
  {
    label: '財務',
    icon: '💰',
    items: [
      { label: '売上', href: p('/finance/revenue'), ready: false, phase: 2 },
      { label: '経費', href: p('/finance/expenses'), ready: false, phase: 2 },
      { label: '利益', href: p('/finance/profit'), ready: false, phase: 2 },
      { label: '入金予定', href: p('/finance/receivables'), ready: false, phase: 2 },
      { label: '支払予定', href: p('/finance/payables'), ready: false, phase: 2 },
      { label: 'キャッシュフロー', href: p('/finance/cashflow'), ready: false, phase: 2 },
    ],
  },
  {
    label: '法務',
    icon: '⚖️',
    items: [
      { label: '契約書', href: p('/company/documents?area=LEGAL'), ready: true, phase: 1 },
      { label: '許認可', href: p('/legal/licenses'), ready: false, phase: 2 },
      { label: '個人情報', href: p('/legal/privacy'), ready: false, phase: 2 },
      { label: '利用規約', href: p('/legal/terms'), ready: false, phase: 2 },
      { label: '重要期限', href: p('/legal/deadlines'), ready: true, phase: 1 },
    ],
  },
  {
    label: 'ナレッジ',
    icon: '📚',
    items: [
      { label: '社内Wiki', href: p('/knowledge'), ready: false, phase: 2 },
      { label: 'マニュアル', href: p('/knowledge/manuals'), ready: false, phase: 2 },
      { label: 'FAQ', href: p('/knowledge/faq'), ready: false, phase: 2 },
      { label: 'ノウハウ', href: p('/knowledge/tips'), ready: false, phase: 2 },
    ],
  },
  {
    label: 'AI',
    icon: '🤖',
    items: [
      { label: 'AI経営アシスタント', href: p('/ai'), ready: true, phase: 1 },
      { label: 'AI分析', href: p('/ai/analysis'), ready: true, phase: 1 },
      { label: 'AI提案', href: p('/ai/suggestions'), ready: false, phase: 3 },
      { label: 'AI議事録', href: p('/ai/minutes'), ready: false, phase: 3 },
      { label: 'AIタスク生成', href: p('/ai/tasks'), ready: false, phase: 3 },
    ],
  },
]

/** そのパスがどのメニュー項目に当たるか（現在地の強調に使う） */
export function isActive(itemHref: string, pathname: string, search: string): boolean {
  const [path, query] = itemHref.split('?')
  if (path !== pathname) return false
  if (!query) return !search || search === '?'
  return (search.startsWith('?') ? search.slice(1) : search) === query
}
