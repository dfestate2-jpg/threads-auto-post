/**
 * 配信本文の組み立て。
 *
 * 「本文テンプレート（管理画面で編集）」＋「物件一覧（自動生成）」＋
 * 「送信者情報と配信停止リンク（法定表示・自動付与）」の3層で作る。
 * 法定表示を担当者が消せない構造にしてあるのが要点。
 */
import type { PropertyType } from '@prisma/client'

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  MANSION: 'マンション',
  HOUSE: '戸建',
  LAND: '土地',
  INVESTMENT: '投資用',
  OTHER: 'その他',
}

export interface TemplateProperty {
  title: string
  propertyType: PropertyType
  area: string | null
  address: string | null
  price: number | null
  layout: string | null
  sizeSqm: number | null
  stationAccess: string | null
  description: string | null
  url: string | null
}

export interface SenderInfo {
  /** 会社名（特定電子メール法の法定表示） */
  org: string
  /** 住所（法定表示） */
  address: string
  tel?: string | null
}

export interface RenderInput {
  subject: string
  body: string
  recipient: { name: string | null }
  properties: TemplateProperty[]
  unsubscribeUrl: string
  sender: SenderInfo
}

export interface RenderedMessage {
  subject: string
  text: string
  html: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 価格（万円）を「3,480万円」「1億2,000万円」の形にする */
export function formatPrice(man: number | null): string | null {
  if (man == null || !Number.isFinite(man)) return null
  if (man < 10000) return `${man.toLocaleString('ja-JP')}万円`
  const oku = Math.floor(man / 10000)
  const rest = man % 10000
  return rest === 0 ? `${oku}億円` : `${oku}億${rest.toLocaleString('ja-JP')}万円`
}

function propertyLines(p: TemplateProperty): string[] {
  const lines: string[] = []
  const price = formatPrice(p.price)
  const spec = [PROPERTY_TYPE_LABEL[p.propertyType], p.layout, p.sizeSqm ? `${p.sizeSqm}平米` : null]
    .filter(Boolean)
    .join(' / ')
  if (price) lines.push(`価格: ${price}`)
  if (spec) lines.push(`種別: ${spec}`)
  const place = p.address ?? p.area
  if (place) lines.push(`所在: ${place}`)
  if (p.stationAccess) lines.push(`交通: ${p.stationAccess}`)
  if (p.description) lines.push(p.description)
  return lines
}

function propertiesAsText(properties: TemplateProperty[]): string {
  if (properties.length === 0) return ''
  return properties
    .map((p, i) => {
      const head = `[${i + 1}] ${p.title}`
      const body = propertyLines(p).map((l) => `    ${l}`)
      if (p.url) body.push(`    詳細: ${p.url}`)
      return [head, ...body].join('\n')
    })
    .join('\n\n')
}

function propertiesAsHtml(properties: TemplateProperty[]): string {
  if (properties.length === 0) return ''
  return properties
    .map((p) => {
      const rows = propertyLines(p)
        .map((l) => `<div style="margin:2px 0;color:#334155;font-size:14px;">${escapeHtml(l)}</div>`)
        .join('')
      const link = p.url
        ? `<div style="margin-top:10px;"><a href="${escapeHtml(p.url)}" style="display:inline-block;padding:8px 16px;background:#0f172a;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;">物件の詳細を見る</a></div>`
        : ''
      return [
        '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0;background:#ffffff;">',
        `<div style="font-weight:bold;font-size:16px;color:#0f172a;margin-bottom:8px;">${escapeHtml(p.title)}</div>`,
        rows,
        link,
        '</div>',
      ].join('')
    })
    .join('')
}

/** 本文テンプレートで使える差し込み変数（管理画面のヘルプにも出す） */
export const PLACEHOLDERS = [
  { key: '{{name}}', desc: 'お客様の名前（未登録なら「お客」）' },
  { key: '{{properties}}', desc: '選んだ物件の一覧' },
  { key: '{{unsubscribe_url}}', desc: '配信停止リンク（書かなくても末尾に付きます）' },
] as const

const PROPERTIES_TOKEN = /\{\{\s*properties\s*\}\}/gi

/**
 * {{properties}} 以外の差し込み変数を展開する。
 * 未知の変数は消さずにそのまま残し、担当者がテスト送信で気づけるようにする。
 */
function fillScalars(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) => {
    const v = values[key.toLowerCase()]
    return v === undefined ? whole : v
  })
}

export function renderMessage(input: RenderInput): RenderedMessage {
  const name = input.recipient.name?.trim() || 'お客'
  const scalars = { name, unsubscribe_url: input.unsubscribeUrl }

  const subject = fillScalars(input.subject, scalars).replace(/[\r\n]+/g, ' ').trim()

  // --- テキスト版 ---
  const bodyText = fillScalars(input.body, scalars).replace(PROPERTIES_TOKEN, propertiesAsText(input.properties))
  const footerText = [
    '--------------------------------------------------',
    input.sender.org,
    input.sender.address,
    input.sender.tel ? `TEL: ${input.sender.tel}` : null,
    '',
    'このメールの配信停止をご希望の方は、下記からお手続きください。',
    input.unsubscribeUrl,
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
  const text = `${bodyText.trimEnd()}\n\n${footerText}\n`

  // --- HTML版 ---
  // 本文はプレーンテキストとして書かれる前提。エスケープしてから改行を <br> にする。
  // {{properties}} の位置で分割し、そこにだけ生成済みHTMLを差し込む
  // （エスケープ後の文字列を検索するより、分割してから各断片を処理するほうが安全）。
  const filled = fillScalars(input.body, scalars)
  const bodyHtml = filled
    .split(PROPERTIES_TOKEN)
    .map((chunk) => escapeHtml(chunk).split('\n').join('<br />'))
    .join(propertiesAsHtml(input.properties))

  const html = [
    '<!doctype html>',
    '<html lang="ja"><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    `<title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f8fafc;">',
    '<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,\'Hiragino Sans\',\'Noto Sans JP\',sans-serif;line-height:1.7;color:#0f172a;">',
    `<div style="font-size:15px;">${bodyHtml}</div>`,
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;" />',
    '<div style="font-size:12px;color:#64748b;">',
    `<div style="font-weight:bold;">${escapeHtml(input.sender.org)}</div>`,
    `<div>${escapeHtml(input.sender.address)}</div>`,
    input.sender.tel ? `<div>TEL: ${escapeHtml(input.sender.tel)}</div>` : '',
    `<div style="margin-top:12px;">このメールの配信停止をご希望の方は <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#0f172a;">こちら</a> からお手続きください。</div>`,
    '</div></div></body></html>',
  ].join('\n')

  return { subject, text, html }
}
