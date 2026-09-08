import { describe, expect, it } from 'vitest'

import { analyze, answer, detectIntent, type CompanySnapshot, type SnapshotTask } from '@/lib/company-os/advisor'

const NOW = new Date('2026-09-08T03:00:00.000Z')

function snapshotTask(overrides: Partial<SnapshotTask> = {}): SnapshotTask {
  return {
    id: 't1',
    title: 'タスク',
    status: 'TODO',
    dueOn: null,
    assigneeName: '山田',
    assigned: true,
    overdueDays: 0,
    score: 30,
    blocked: false,
    area: 'OTHER',
    reasons: [],
    ...overrides,
  }
}

function snapshot(overrides: Partial<CompanySnapshot> = {}): CompanySnapshot {
  return {
    now: NOW,
    companyName: 'テスト社',
    stage: 'ESTABLISHED',
    tasks: [],
    projects: [],
    issues: [],
    questions: [],
    decisionCount: 3,
    lastDecisionAt: new Date('2026-09-01T00:00:00.000Z'),
    lastMeetingAt: null,
    meetingCount: 0,
    expiringDocuments: [],
    metrics: [],
    foundingPercent: 100,
    ...overrides,
  }
}

describe('analyze', () => {
  it('問題が無くても必ず1件返す', () => {
    const findings = analyze(snapshot())
    expect(findings).toHaveLength(1)
    expect(findings[0]?.level).toBe('GOOD')
  })

  it('期限超過が多いと最重要として扱う', () => {
    const findings = analyze(
      snapshot({
        tasks: Array.from({ length: 6 }, (_, i) =>
          snapshotTask({ id: `t${i}`, title: `タスク${i}`, overdueDays: i + 1 }),
        ),
      }),
    )
    expect(findings[0]?.level).toBe('CRITICAL')
    expect(findings[0]?.title).toContain('期限を過ぎたタスクが6件')
  })

  it('担当者のいない課題を指摘する', () => {
    const findings = analyze(
      snapshot({
        issues: [
          { id: 'i1', title: 'サポート体制', severity: 'MEDIUM', status: 'OPEN', hasOwner: false, hasCountermeasure: true, dueOn: null },
        ],
      }),
    )
    expect(findings.some((f) => f.title.includes('担当者のいない課題'))).toBe(true)
  })

  it('キャッシュが3か月分を切ると最重要にする', () => {
    const findings = analyze(
      snapshot({
        metrics: [
          { key: 'cash_balance', label: 'キャッシュ残高', unit: '円', value: 2_000_000, target: null },
          { key: 'expense_month', label: '今月の経費', unit: '円', value: 1_000_000, target: null },
        ],
      }),
    )
    const cash = findings.find((f) => f.title.includes('キャッシュ'))
    expect(cash?.level).toBe('CRITICAL')
  })

  it('遅延プロジェクトを検出する', () => {
    const findings = analyze(
      snapshot({
        projects: [
          { id: 'p1', name: '会社立ち上げ', health: 'DELAYED', percent: 20, daysLeft: -10, openTaskCount: 8, overdueTaskCount: 3 },
        ],
      }),
    )
    expect(findings.some((f) => f.title.includes('遅延しているプロジェクト'))).toBe(true)
  })

  it('重い順に並ぶ', () => {
    const findings = analyze(
      snapshot({
        tasks: [snapshotTask({ overdueDays: 9 })],
        questions: [{ id: 'q1', title: '料金', status: 'OPEN', dueOn: new Date('2026-09-01T00:00:00.000Z'), severity: 'LOW' }],
      }),
    )
    const weights = findings.map((f) => f.weight)
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
  })
})

describe('detectIntent', () => {
  it('質問の意図を判定する', () => {
    expect(detectIntent('今日何をやるべき？')).toBe('today')
    expect(detectIntent('今一番重要な課題は？')).toBe('issue')
    expect(detectIntent('期限が危ないタスクは？')).toBe('deadline')
    expect(detectIntent('このプロジェクトは遅れている？')).toBe('project')
    expect(detectIntent('過去に何を決定した？')).toBe('decision')
    expect(detectIntent('売上はどう？')).toBe('metric')
  })

  it('判定できない質問は全体のまとめとして扱う', () => {
    expect(detectIntent('こんにちは')).toBe('summary')
  })
})

describe('answer', () => {
  it('今日やることを点数順に返す', () => {
    const result = answer(
      '今日何をやるべき？',
      snapshot({
        tasks: [
          snapshotTask({ id: 'low', title: '低い', score: 10 }),
          snapshotTask({ id: 'high', title: '高い', score: 90, reasons: ['今日が期限'] }),
        ],
      }),
    )
    expect(result.tasks[0]?.id).toBe('high')
    expect(result.text).toContain('高い')
  })

  it('着手できないタスクは今日の提案から外す', () => {
    const result = answer(
      '今日やることは？',
      snapshot({ tasks: [snapshotTask({ id: 'blocked', score: 99, blocked: true })] }),
    )
    expect(result.tasks).toHaveLength(0)
  })

  it('データが無くても答えを返す', () => {
    const result = answer('今の会社の状況をまとめて', snapshot())
    expect(result.text).toContain('テスト社')
  })
})
