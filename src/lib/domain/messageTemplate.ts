/**
 * LINE送信テンプレートの差し込み（副作用なし）。
 *
 * 営業マンに文章を考えさせないための仕組み。
 * 将来 AI 生成に置き換えるときも「候補を出す → 営業マンが確認して送る」という
 * 経路は変えないため、ここを差し替えるだけで済むようにしてある。【指示書 9】
 */
import type { CustomerStatus } from '@prisma/client'

export interface TemplateVariables {
  name?: string | null
  assignee?: string | null
  area?: string | null
  rent?: number | null
  company?: string | null
}

/** 差し込み可能な変数の一覧（設定画面の説明に使う） */
export const TEMPLATE_PLACEHOLDERS = ['name', 'assignee', 'area', 'rent', 'company'] as const

function valueOf(vars: TemplateVariables, key: string): string {
  switch (key) {
    case 'name':
      return vars.name?.trim() || 'お客'
    case 'assignee':
      return vars.assignee?.trim() || '担当'
    case 'area':
      return vars.area?.trim() || 'ご希望エリア'
    case 'rent':
      return vars.rent ? `${vars.rent.toLocaleString('ja-JP')}円` : 'ご希望のご予算'
    case 'company':
      return vars.company?.trim() || '弊社'
    default:
      return ''
  }
}

/**
 * `{{name}}` 形式の変数を差し込む。
 * 未知の変数は空文字にせずそのまま残す（テンプレートの打ち間違いに気づけるようにするため）。
 */
export function renderTemplate(body: string, vars: TemplateVariables): string {
  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (whole, key: string) => {
    if (!(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(key)) return whole
    return valueOf(vars, key)
  })
}

export interface TemplateLike {
  key: string
  title: string
  body: string
  status: CustomerStatus | null
  sortOrder: number
  enabled: boolean
}

/**
 * 顧客の現在の状況に合う候補文を、合うものから順に返す。
 * ステータス専用のテンプレートを先に、どの状況でも使える汎用テンプレートを後に置く。
 */
export function pickTemplates<T extends TemplateLike>(templates: T[], status: CustomerStatus): T[] {
  return templates
    .filter((t) => t.enabled)
    .filter((t) => t.status === null || t.status === status)
    .sort((a, b) => {
      const aMatch = a.status === status ? 0 : 1
      const bMatch = b.status === status ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
      return a.sortOrder - b.sortOrder
    })
}
