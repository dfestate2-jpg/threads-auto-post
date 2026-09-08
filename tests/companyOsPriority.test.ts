import { describe, expect, it } from 'vitest'

import { levelOf, pickTopTasks, rankTasks, scoreTask, type TaskSignals } from '@/lib/company-os/priority'

const NOW = new Date('2026-09-08T03:00:00.000Z') // JST 12:00

function task(overrides: Partial<TaskSignals> = {}): TaskSignals {
  return {
    id: 't1',
    title: 'タスク',
    status: 'TODO',
    priority: 'MEDIUM',
    dueOn: null,
    revenueImpact: 0,
    riskImpact: 0,
    blockingCount: 0,
    blockedByCount: 0,
    project: null,
    ...overrides,
  }
}

function date(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

describe('scoreTask', () => {
  it('完了・中止したタスクは0点にして並べ替えの対象外にする', () => {
    expect(scoreTask(task({ status: 'DONE', priority: 'TOP' }), NOW).score).toBe(0)
    expect(scoreTask(task({ status: 'CANCELED', priority: 'TOP' }), NOW).score).toBe(0)
  })

  it('期限超過は日数が増えるほど重くなる', () => {
    const oneDay = scoreTask(task({ dueOn: date('2026-09-07') }), NOW)
    const fiveDays = scoreTask(task({ dueOn: date('2026-09-03') }), NOW)
    expect(fiveDays.score).toBeGreaterThan(oneDay.score)
    expect(oneDay.overdueDays).toBe(1)
    expect(fiveDays.overdueDays).toBe(5)
  })

  it('超過の加点は青天井にしない（10日で頭打ち）', () => {
    const tenDays = scoreTask(task({ dueOn: date('2026-08-29') }), NOW)
    const hundredDays = scoreTask(task({ dueOn: date('2026-05-31') }), NOW)
    expect(hundredDays.score).toBe(tenDays.score)
  })

  it('理由を必ず言葉で返す', () => {
    const scored = scoreTask(task({ dueOn: date('2026-09-08'), priority: 'TOP', revenueImpact: 3 }), NOW)
    expect(scored.reasons).toContain('最優先に指定')
    expect(scored.reasons).toContain('今日が期限')
    expect(scored.reasons).toContain('売上への影響が大きい')
  })

  it('他タスクを止めているタスクは加点する', () => {
    const alone = scoreTask(task(), NOW)
    const blocker = scoreTask(task({ blockingCount: 3 }), NOW)
    expect(blocker.score).toBeGreaterThan(alone.score)
    expect(blocker.reasons).toContain('他の3件を止めている')
  })

  it('先行タスク待ちは減点し、着手できない印を付ける', () => {
    const ready = scoreTask(task({ priority: 'TOP', dueOn: date('2026-09-08') }), NOW)
    const blocked = scoreTask(task({ priority: 'TOP', dueOn: date('2026-09-08'), blockedByCount: 2 }), NOW)
    expect(blocked.blocked).toBe(true)
    expect(blocked.score).toBeLessThan(ready.score)
    expect(blocked.reasons).toContain('先行タスク2件の完了待ち')
  })

  it('保留は大きく下げる', () => {
    const todo = scoreTask(task({ priority: 'HIGH' }), NOW)
    const held = scoreTask(task({ priority: 'HIGH', status: 'ON_HOLD' }), NOW)
    expect(held.score).toBeLessThan(todo.score)
  })

  it('プロジェクトが遅延していると引き上げる', () => {
    const plain = scoreTask(task(), NOW)
    const delayed = scoreTask(
      task({ project: { status: 'ACTIVE', dueOn: date('2026-09-01'), priority: 'MEDIUM' } }),
      NOW,
    )
    expect(delayed.score).toBeGreaterThan(plain.score)
    expect(delayed.reasons).toContain('プロジェクトが遅延中')
  })

  it('インパクトの値が範囲外でも壊れない', () => {
    expect(scoreTask(task({ revenueImpact: 99, riskImpact: -5 }), NOW).score).toBe(
      scoreTask(task({ revenueImpact: 3, riskImpact: 0 }), NOW).score,
    )
  })
})

describe('levelOf', () => {
  it('点数を4段階に落とす', () => {
    expect(levelOf(100)).toBe('TOP')
    expect(levelOf(70)).toBe('TOP')
    expect(levelOf(69)).toBe('HIGH')
    expect(levelOf(45)).toBe('HIGH')
    expect(levelOf(22)).toBe('MEDIUM')
    expect(levelOf(21)).toBe('LOW')
  })
})

describe('rankTasks', () => {
  it('強い順に並び、同点なら期限が近い順になる', () => {
    const rows = rankTasks(
      [
        task({ id: 'a', title: 'A', dueOn: date('2026-09-20') }),
        task({ id: 'b', title: 'B', dueOn: date('2026-09-10') }),
        task({ id: 'c', title: 'C', priority: 'TOP', dueOn: date('2026-09-01') }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.task.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('pickTopTasks', () => {
  it('着手できるタスクを優先して返す', () => {
    const rows = pickTopTasks(
      [
        task({ id: 'blocked', priority: 'TOP', dueOn: date('2026-09-01'), blockedByCount: 1 }),
        task({ id: 'ready', priority: 'HIGH', dueOn: date('2026-09-09') }),
      ],
      NOW,
      1,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.task.id).toBe('ready')
  })

  it('着手できるものが足りないときは先行待ちで埋める', () => {
    const rows = pickTopTasks([task({ id: 'blocked', priority: 'TOP', blockedByCount: 1 })], NOW, 5)
    expect(rows.map((r) => r.task.id)).toEqual(['blocked'])
  })

  it('0点のタスク（完了済み）は出さない', () => {
    const rows = pickTopTasks([task({ id: 'done', status: 'DONE' })], NOW, 5)
    expect(rows).toHaveLength(0)
  })
})
