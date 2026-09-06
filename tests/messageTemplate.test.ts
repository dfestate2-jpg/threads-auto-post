import { describe, expect, it } from 'vitest'

import { pickTemplates, renderTemplate, type TemplateLike } from '@/lib/domain/messageTemplate'

describe('LINEテンプレートの差し込み【指示書 9】', () => {
  it('顧客情報を差し込む', () => {
    const text = renderTemplate('{{name}}様\n{{assignee}}です。{{area}}・{{rent}}前後でお探しします。', {
      name: '山田',
      assignee: '佐藤',
      area: '三軒茶屋',
      rent: 120000,
    })
    expect(text).toBe('山田様\n佐藤です。三軒茶屋・120,000円前後でお探しします。')
  })

  it('値が無くても文章が壊れない', () => {
    expect(renderTemplate('{{name}}様、{{assignee}}です', {})).toBe('お客様、担当です')
  })

  it('未知の変数はそのまま残す（テンプレートの打ち間違いに気づけるように）', () => {
    expect(renderTemplate('{{unknown}}', { name: '山田' })).toBe('{{unknown}}')
  })
})

describe('候補文の並び', () => {
  const templates: TemplateLike[] = [
    { key: 'general', title: '汎用', body: 'g', status: null, sortOrder: 100, enabled: true },
    { key: 'quote', title: '見積書待ち', body: 'q', status: 'AWAITING_QUOTE', sortOrder: 40, enabled: true },
    { key: 'viewed', title: '内見後', body: 'v', status: 'VIEWED', sortOrder: 60, enabled: true },
    { key: 'off', title: '停止中', body: 'x', status: 'AWAITING_QUOTE', sortOrder: 1, enabled: false },
  ]

  it('今のステータス専用の文章が先頭に来る', () => {
    const picked = pickTemplates(templates, 'AWAITING_QUOTE')
    expect(picked.map((t) => t.key)).toEqual(['quote', 'general'])
  })

  it('無効なテンプレートは候補に出さない', () => {
    expect(pickTemplates(templates, 'AWAITING_QUOTE').some((t) => t.key === 'off')).toBe(false)
  })
})
