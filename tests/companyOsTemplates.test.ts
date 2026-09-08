import { describe, expect, it } from 'vitest'

import { MA_TEMPLATE, PROJECT_TEMPLATES, STARTUP_TEMPLATE, findTemplate, validateTemplate } from '@/lib/company-os/templates'

describe('validateTemplate', () => {
  it('同梱テンプレートに問題がない', () => {
    for (const template of PROJECT_TEMPLATES) {
      expect(validateTemplate(template), `${template.key} に問題があります`).toEqual([])
    }
  })

  it('存在しない依存先を検出する', () => {
    const problems = validateTemplate({
      ...STARTUP_TEMPLATE,
      key: 'broken',
      tasks: [{ key: 'a', title: 'A', area: 'OTHER', priority: 'LOW', offsetDays: 1, dependsOn: ['zzz'] }],
    })
    expect(problems).toContain('a: 依存先 zzz が存在しません')
  })

  it('自己依存を検出する', () => {
    const problems = validateTemplate({
      ...STARTUP_TEMPLATE,
      key: 'self',
      tasks: [{ key: 'a', title: 'A', area: 'OTHER', priority: 'LOW', offsetDays: 1, dependsOn: ['a'] }],
    })
    expect(problems).toContain('a: 自分自身に依存しています')
  })

  it('循環を検出する', () => {
    const problems = validateTemplate({
      ...STARTUP_TEMPLATE,
      key: 'cycle',
      tasks: [
        { key: 'a', title: 'A', area: 'OTHER', priority: 'LOW', offsetDays: 1, dependsOn: ['b'] },
        { key: 'b', title: 'B', area: 'OTHER', priority: 'LOW', offsetDays: 1, dependsOn: ['a'] },
      ],
    })
    expect(problems.some((p) => p.includes('循環'))).toBe(true)
  })

  it('key の重複を検出する', () => {
    const problems = validateTemplate({
      ...STARTUP_TEMPLATE,
      key: 'dup',
      tasks: [
        { key: 'a', title: 'A', area: 'OTHER', priority: 'LOW', offsetDays: 1 },
        { key: 'a', title: 'A2', area: 'OTHER', priority: 'LOW', offsetDays: 1 },
      ],
    })
    expect(problems).toContain('key が重複しています')
  })
})

describe('会社立ち上げテンプレート', () => {
  it('依頼された幹の流れが依存関係でつながっている', () => {
    const byKey = new Map(STARTUP_TEMPLATE.tasks.map((t) => [t.key, t]))
    // 登記 → 法人口座 → 会計 → 営業資料 → 初回営業 → 初回契約
    expect(byKey.get('registration')?.dependsOn).toContain('articles')
    expect(byKey.get('bank_account')?.dependsOn).toContain('registration')
    expect(byKey.get('accounting')?.dependsOn).toContain('bank_account')
    expect(byKey.get('sales_material')?.dependsOn).toContain('accounting')
    expect(byKey.get('first_sales')?.dependsOn).toContain('hearing')
    expect(byKey.get('first_contract')?.dependsOn).toContain('proposal')
  })

  it('商品完成（MVP）が初回営業より前に来る', () => {
    const byKey = new Map(STARTUP_TEMPLATE.tasks.map((t) => [t.key, t]))
    const mvp = byKey.get('mvp')
    const firstSales = byKey.get('first_sales')
    expect(mvp && firstSales && mvp.offsetDays < firstSales.offsetDays).toBe(true)
  })

  it('依頼書にある領域をすべて含む', () => {
    const areas = new Set(STARTUP_TEMPLATE.tasks.map((t) => t.area))
    for (const area of ['COMPANY', 'LEGAL', 'MANAGEMENT', 'SALES', 'DEVELOPMENT', 'SUBSIDY', 'CUSTOMER'] as const) {
      expect(areas.has(area), `${area} のタスクがありません`).toBe(true)
    }
  })
})

describe('M&Aテンプレート', () => {
  it('DD → 契約 → 買収後 の順になっている', () => {
    const byKey = new Map(MA_TEMPLATE.tasks.map((t) => [t.key, t]))
    expect(byKey.get('ma_spa')?.dependsOn).toContain('ma_dd_legal')
    expect(byKey.get('ma_closing')?.dependsOn).toContain('ma_spa')
    expect(byKey.get('ma_representative')?.dependsOn).toContain('ma_closing')
  })
})

describe('findTemplate', () => {
  it('未知のキーには null を返す', () => {
    expect(findTemplate('unknown')).toBeNull()
    expect(findTemplate('startup')?.key).toBe('startup')
  })
})
