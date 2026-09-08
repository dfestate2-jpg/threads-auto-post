/**
 * 各データの入力項目の定義。
 *
 * 画面（サーバー側）で選択肢を用意し、この関数で組み立ててフォームへ渡す。
 * 定義はただのデータなので、サーバーからクライアントへそのまま渡せる。
 */
import type { FieldSpec } from '@/components/company-os/fields'
import {
  AREA_LABEL, ISSUE_STATUS_LABEL, OBJECTIVE_STATUS_LABEL, PRIORITY_LABEL, PROJECT_STATUS_LABEL,
  QUESTION_STATUS_LABEL, ROLE_LABEL, SEVERITY_LABEL, STAGE_LABEL, TASK_STATUS_LABEL, VISIBILITY_LABEL,
  optionsOf,
} from './labels'

export interface Option {
  value: string
  label: string
}

export interface FormOptions {
  members?: Option[]
  projects?: Option[]
  issues?: Option[]
  meetings?: Option[]
}

const IMPACT_OPTIONS: Option[] = [
  { value: '0', label: 'なし' },
  { value: '1', label: '小' },
  { value: '2', label: '中' },
  { value: '3', label: '大' },
]

export function taskFields(options: FormOptions = {}): FieldSpec[] {
  return [
    { name: 'title', label: 'タスク名', type: 'text', required: true, full: true },
    { name: 'description', label: '説明', type: 'textarea', rows: 3 },
    { name: 'status', label: 'ステータス', type: 'select', required: true, options: optionsOf(TASK_STATUS_LABEL) },
    { name: 'priority', label: '優先度', type: 'select', required: true, options: optionsOf(PRIORITY_LABEL) },
    { name: 'area', label: 'カテゴリー', type: 'select', required: true, options: optionsOf(AREA_LABEL) },
    { name: 'assigneeId', label: '担当者', type: 'select', options: options.members ?? [] },
    { name: 'projectId', label: 'プロジェクト', type: 'select', options: options.projects ?? [] },
    { name: 'issueId', label: '関連する経営課題', type: 'select', options: options.issues ?? [] },
    { name: 'startOn', label: '開始日', type: 'date' },
    { name: 'dueOn', label: '期限', type: 'date' },
    { name: 'relatedCustomer', label: '関連顧客', type: 'text' },
    { name: 'relatedParty', label: '関連会社', type: 'text' },
    {
      name: 'revenueImpact',
      label: '売上への影響',
      type: 'select',
      options: IMPACT_OPTIONS,
      required: true,
      hint: '優先順位の計算に使います',
    },
    {
      name: 'riskImpact',
      label: '放置したときのリスク',
      type: 'select',
      options: IMPACT_OPTIONS,
      required: true,
      hint: '優先順位の計算に使います',
    },
  ]
}

export function projectFields(options: FormOptions = {}): FieldSpec[] {
  return [
    { name: 'name', label: 'プロジェクト名', type: 'text', required: true, full: true },
    { name: 'description', label: '説明', type: 'textarea', rows: 3 },
    { name: 'status', label: 'ステータス', type: 'select', required: true, options: optionsOf(PROJECT_STATUS_LABEL) },
    { name: 'priority', label: '優先度', type: 'select', required: true, options: optionsOf(PRIORITY_LABEL) },
    { name: 'area', label: '領域', type: 'select', required: true, options: optionsOf(AREA_LABEL) },
    { name: 'ownerId', label: '責任者', type: 'select', options: options.members ?? [] },
    { name: 'startOn', label: '開始日', type: 'date' },
    { name: 'dueOn', label: '期限', type: 'date' },
    {
      name: 'progressOverride',
      label: '進捗率（手入力）',
      type: 'number',
      hint: '空欄ならタスクの完了率から自動で計算します',
    },
  ]
}

export function milestoneFields(): FieldSpec[] {
  return [
    { name: 'name', label: 'マイルストーン名', type: 'text', required: true, full: true },
    { name: 'dueOn', label: '期限', type: 'date' },
  ]
}

export function issueFields(options: FormOptions = {}): FieldSpec[] {
  return [
    { name: 'title', label: '課題名', type: 'text', required: true, full: true },
    { name: 'detail', label: '詳細', type: 'textarea', rows: 3 },
    { name: 'severity', label: '重要度', type: 'select', required: true, options: optionsOf(SEVERITY_LABEL) },
    { name: 'status', label: 'ステータス', type: 'select', required: true, options: optionsOf(ISSUE_STATUS_LABEL) },
    { name: 'area', label: '領域', type: 'select', required: true, options: optionsOf(AREA_LABEL) },
    { name: 'ownerId', label: '担当者', type: 'select', options: options.members ?? [] },
    { name: 'occurredOn', label: '発生日', type: 'date' },
    { name: 'dueOn', label: '期限', type: 'date' },
    { name: 'projectId', label: '関連プロジェクト', type: 'select', options: options.projects ?? [] },
    { name: 'cause', label: '原因', type: 'textarea', rows: 2 },
    { name: 'countermeasure', label: '対策', type: 'textarea', rows: 2 },
    { name: 'nextAction', label: '次のアクション', type: 'text', full: true },
    { name: 'visibility', label: '公開範囲', type: 'select', required: true, options: optionsOf(VISIBILITY_LABEL) },
  ]
}

export function decisionFields(options: FormOptions = {}): FieldSpec[] {
  return [
    { name: 'title', label: '決定事項', type: 'text', required: true, full: true },
    { name: 'background', label: '背景', type: 'textarea', rows: 3 },
    { name: 'reason', label: 'そう決めた理由', type: 'textarea', rows: 3 },
    { name: 'decidedOn', label: '決定日', type: 'date', required: true },
    { name: 'deciderId', label: '決定者', type: 'select', options: options.members ?? [] },
    { name: 'deciderName', label: '決定者（メンバー未登録の場合）', type: 'text' },
    { name: 'area', label: '領域', type: 'select', required: true, options: optionsOf(AREA_LABEL) },
    { name: 'projectId', label: '関連プロジェクト', type: 'select', options: options.projects ?? [] },
    { name: 'issueId', label: '関連する経営課題', type: 'select', options: options.issues ?? [] },
    { name: 'important', label: '重要な決定（ダッシュボードに出す）', type: 'checkbox' },
    { name: 'visibility', label: '公開範囲', type: 'select', required: true, options: optionsOf(VISIBILITY_LABEL) },
  ]
}

export function questionFields(options: FormOptions = {}): FieldSpec[] {
  return [
    { name: 'title', label: '未決事項', type: 'text', required: true, full: true },
    { name: 'point', label: '論点', type: 'textarea', rows: 3 },
    { name: 'options', label: '選択肢', type: 'choices', hint: '案ごとにメリット・デメリットを並べて比べます' },
    { name: 'recommendation', label: '推奨案', type: 'textarea', rows: 2 },
    { name: 'status', label: 'ステータス', type: 'select', required: true, options: optionsOf(QUESTION_STATUS_LABEL) },
    { name: 'severity', label: '重要度', type: 'select', required: true, options: optionsOf(SEVERITY_LABEL) },
    { name: 'area', label: '領域', type: 'select', required: true, options: optionsOf(AREA_LABEL) },
    { name: 'ownerId', label: '担当者', type: 'select', options: options.members ?? [] },
    { name: 'dueOn', label: 'いつまでに決めるか', type: 'date' },
    { name: 'projectId', label: '関連プロジェクト', type: 'select', options: options.projects ?? [] },
  ]
}

export function meetingFields(): FieldSpec[] {
  return [
    { name: 'title', label: '会議名', type: 'text', required: true, full: true },
    { name: 'heldAt', label: '日時', type: 'datetime', required: true },
    { name: 'attendees', label: '参加者', type: 'tags', hint: '読点（、）区切りで入力します' },
    { name: 'agenda', label: '議題', type: 'textarea', rows: 3 },
    {
      name: 'minutes',
      label: '議事録',
      type: 'textarea',
      rows: 12,
      hint: '「## 決定事項」「## タスク」などの見出しで書くと、あとから自動で仕分けできます',
    },
    { name: 'visibility', label: '公開範囲', type: 'select', required: true, options: optionsOf(VISIBILITY_LABEL) },
  ]
}

export function objectiveFields(options: FormOptions = {}): FieldSpec[] {
  return [
    { name: 'title', label: '目標名', type: 'text', required: true, full: true },
    { name: 'description', label: '説明', type: 'textarea', rows: 2 },
    { name: 'isKpi', label: '数値で追う（KPI）', type: 'checkbox' },
    { name: 'targetValue', label: '目標値', type: 'number' },
    { name: 'currentValue', label: '現在値', type: 'number' },
    { name: 'unit', label: '単位', type: 'text', placeholder: '円 / 件 / 社 / %' },
    { name: 'status', label: '状態', type: 'select', required: true, options: optionsOf(OBJECTIVE_STATUS_LABEL) },
    { name: 'area', label: '領域', type: 'select', required: true, options: optionsOf(AREA_LABEL) },
    { name: 'periodLabel', label: '対象期間', type: 'text', placeholder: '2026年度 / 第1四半期' },
    { name: 'dueOn', label: '期限', type: 'date' },
    { name: 'ownerId', label: '担当者', type: 'select', options: options.members ?? [] },
  ]
}

export function memberFields(): FieldSpec[] {
  return [
    { name: 'name', label: '名前', type: 'text', required: true },
    { name: 'email', label: 'メールアドレス', type: 'text' },
    { name: 'role', label: '権限', type: 'select', required: true, options: optionsOf(ROLE_LABEL) },
    { name: 'title', label: '役職', type: 'text', placeholder: '代表取締役 / 取締役' },
    { name: 'department', label: '部署・担当領域', type: 'text' },
    { name: 'isOfficer', label: '役員として登録する', type: 'checkbox' },
    { name: 'note', label: 'メモ', type: 'textarea', rows: 2 },
    { name: 'active', label: '在籍中', type: 'checkbox' },
  ]
}

export function shareholderFields(): FieldSpec[] {
  return [
    { name: 'name', label: '株主名', type: 'text', required: true },
    { name: 'isCompany', label: '法人', type: 'checkbox' },
    { name: 'shares', label: '保有株式数', type: 'number' },
    { name: 'ratio', label: '出資比率（%）', type: 'number' },
    { name: 'amount', label: '出資額（円）', type: 'number' },
    { name: 'note', label: 'メモ', type: 'textarea', rows: 2 },
  ]
}

export function documentFields(options: FormOptions = {}): FieldSpec[] {
  return [
    { name: 'name', label: '書類名', type: 'text', required: true, full: true },
    {
      name: 'location',
      label: '保管場所',
      type: 'text',
      full: true,
      placeholder: 'https://... / 金庫 / 税理士預かり',
      hint: 'URLでも、置いてある場所の説明でも構いません',
    },
    { name: 'area', label: '分類', type: 'select', required: true, options: optionsOf(AREA_LABEL) },
    { name: 'expiresOn', label: '更新・満了期限', type: 'date', hint: '入れておくと期限前にダッシュボードへ出ます' },
    { name: 'projectId', label: '関連プロジェクト', type: 'select', options: options.projects ?? [] },
    { name: 'visibility', label: '公開範囲', type: 'select', required: true, options: optionsOf(VISIBILITY_LABEL) },
    { name: 'note', label: 'メモ', type: 'textarea', rows: 2 },
  ]
}

export function companyFields(): FieldSpec[] {
  return [
    { name: 'name', label: '会社名', type: 'text', required: true },
    { name: 'legalName', label: '登記上の商号', type: 'text' },
    { name: 'stage', label: '段階', type: 'select', required: true, options: optionsOf(STAGE_LABEL) },
    { name: 'industry', label: '業種', type: 'text' },
    { name: 'foundedOn', label: '設立日', type: 'date' },
    { name: 'capital', label: '資本金（円）', type: 'text', placeholder: '1000000' },
    { name: 'fiscalMonth', label: '決算月', type: 'number', placeholder: '3' },
    { name: 'corporateNumber', label: '法人番号', type: 'text' },
    { name: 'address', label: '本店所在地', type: 'text', full: true },
    { name: 'phone', label: '電話番号', type: 'text' },
    { name: 'website', label: 'ウェブサイト', type: 'text' },
    { name: 'vision', label: '何のための会社か', type: 'text', full: true },
    { name: 'purpose', label: '事業目的', type: 'textarea', rows: 6, hint: '定款に書く事業目的の下書きとしても使えます' },
    { name: 'notes', label: 'メモ', type: 'textarea', rows: 3 },
  ]
}
