import { describe, expect, it } from 'vitest'

import { bucketByDue, projectHealth, taskProgress } from '@/lib/company-os/progress'
import { addDaysToKey, daysUntilDue, formatDueLabel, fromDateKey, toDateKey } from '@/lib/company-os/date'

const NOW = new Date('2026-09-08T03:00:00.000Z') // JST 12:00
const date = (key: string) => fromDateKey(key) as Date

describe('taskProgress', () => {
  it('中止したタスクは母数から外す', () => {
    expect(taskProgress(['DONE', 'TODO', 'CANCELED'])).toEqual({ done: 1, total: 2, percent: 50 })
  })

  it('タスクが無ければ0%', () => {
    expect(taskProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it('手入力があればそちらを使う', () => {
    expect(taskProgress(['TODO', 'TODO'], 80).percent).toBe(80)
    expect(taskProgress(['TODO'], 500).percent).toBe(100)
    expect(taskProgress(['TODO'], -10).percent).toBe(0)
  })
})

describe('projectHealth', () => {
  const base = { startOn: null, dueOn: null, overdueTaskCount: 0, now: NOW }

  it('期限を過ぎて未完了なら遅延', () => {
    expect(
      projectHealth({
        ...base,
        status: 'ACTIVE',
        dueOn: date('2026-09-01'),
        progress: { done: 1, total: 4, percent: 25 },
      }),
    ).toBe('DELAYED')
  })

  it('経過に対して進捗が遅れていれば注意', () => {
    expect(
      projectHealth({
        ...base,
        status: 'ACTIVE',
        startOn: date('2026-08-09'),
        dueOn: date('2026-10-08'),
        progress: { done: 0, total: 10, percent: 0 },
      }),
    ).toBe('AT_RISK')
  })

  it('期限超過タスクを抱えていれば注意', () => {
    expect(
      projectHealth({
        ...base,
        status: 'ACTIVE',
        progress: { done: 5, total: 10, percent: 50 },
        overdueTaskCount: 2,
      }),
    ).toBe('AT_RISK')
  })

  it('タスクが無いうちは未着手', () => {
    expect(projectHealth({ ...base, status: 'ACTIVE', progress: { done: 0, total: 0, percent: 0 } })).toBe('IDLE')
  })

  it('完了したプロジェクトは完了', () => {
    expect(projectHealth({ ...base, status: 'DONE', progress: { done: 1, total: 1, percent: 100 } })).toBe('DONE')
  })
})

describe('bucketByDue', () => {
  it('期限超過・今日・今週・その先・期限なしに分ける', () => {
    const items = [
      { id: 'over', due: date('2026-09-07') },
      { id: 'today', due: date('2026-09-08') },
      { id: 'week', due: date('2026-09-12') },
      { id: 'later', due: date('2026-10-01') },
      { id: 'none', due: null },
    ]
    const result = bucketByDue(items, (i) => i.due, NOW)
    expect(result.overdue.map((i) => i.id)).toEqual(['over'])
    expect(result.today.map((i) => i.id)).toEqual(['today'])
    expect(result.week.map((i) => i.id)).toEqual(['week'])
    expect(result.later.map((i) => i.id)).toEqual(['later'])
    expect(result.noDue.map((i) => i.id)).toEqual(['none'])
  })
})

describe('日付の扱い', () => {
  it('日本時間での「今日」を返す（UTCの日付とずれる時刻でも）', () => {
    // UTC では 9/7 だが、日本時間では 9/8
    expect(toDateKey(new Date('2026-09-07T16:00:00.000Z'), 'Asia/Tokyo')).toBe('2026-09-08')
  })

  it('期限までの日数を日本時間で数える', () => {
    expect(daysUntilDue(date('2026-09-08'), NOW)).toBe(0)
    expect(daysUntilDue(date('2026-09-10'), NOW)).toBe(2)
    expect(daysUntilDue(date('2026-09-05'), NOW)).toBe(-3)
    expect(daysUntilDue(null, NOW)).toBeNull()
  })

  it('人が読める言葉にする', () => {
    expect(formatDueLabel(date('2026-09-08'), NOW)).toBe('今日')
    expect(formatDueLabel(date('2026-09-09'), NOW)).toBe('明日')
    expect(formatDueLabel(date('2026-09-06'), NOW)).toBe('2日超過')
    expect(formatDueLabel(null, NOW)).toBe('期限なし')
  })

  it('月をまたいで日数を足せる', () => {
    expect(addDaysToKey('2026-09-28', 5)).toBe('2026-10-03')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
  })
})
