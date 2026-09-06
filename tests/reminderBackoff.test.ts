import { describe, expect, it } from 'vitest'

import { policy } from './helpers'
import { computeNextReminderAt, effectiveIntervalMinutes } from '@/lib/domain/reminderSchedule'

const base = policy()

const at = (iso: string): Date => new Date(iso)

describe('effectiveIntervalMinutes', () => {
  it('バックオフOFFなら常に基準の間隔', () => {
    const p = { ...base, backoffEnabled: false }
    expect(effectiveIntervalMinutes(p, 1)).toBe(60)
    expect(effectiveIntervalMinutes(p, 5)).toBe(60)
  })

  it('回を追うごとに倍になる', () => {
    const p = { ...base, backoffEnabled: true, maxIntervalMinutes: 0 }
    expect(effectiveIntervalMinutes(p, 1)).toBe(60)
    expect(effectiveIntervalMinutes(p, 2)).toBe(120)
    expect(effectiveIntervalMinutes(p, 3)).toBe(240)
    expect(effectiveIntervalMinutes(p, 4)).toBe(480)
  })

  it('上限を超えて広がらない', () => {
    const p = { ...base, backoffEnabled: true, maxIntervalMinutes: 480 }
    expect(effectiveIntervalMinutes(p, 4)).toBe(480)
    expect(effectiveIntervalMinutes(p, 10)).toBe(480)
  })

  /** 指数は簡単に跳ね上がる。上限なし設定でも実用外の値にならないことを確かめる */
  it('回数が大きくても上限で頭が押さえられる', () => {
    const p = { ...base, backoffEnabled: true, maxIntervalMinutes: 480 }
    expect(effectiveIntervalMinutes(p, 50)).toBe(480)
  })

  it('上限が基準より小さくても、基準を下回らない', () => {
    const p = { ...base, intervalMinutes: 180, backoffEnabled: true, maxIntervalMinutes: 60 }
    expect(effectiveIntervalMinutes(p, 3)).toBe(180)
  })

  it('まだ1通も送っていなければ基準のまま', () => {
    const p = { ...base, backoffEnabled: true }
    expect(effectiveIntervalMinutes(p, 0)).toBe(60)
  })
})

describe('computeNextReminderAt（バックオフ）', () => {
  const state = (reminderCount: number, lastReminderAt: string) => ({
    awaitingSince: at('2026-09-06T00:00:00Z'),
    firstUnrepliedAt: at('2026-09-06T00:00:00Z'),
    reminderCount,
    lastReminderAt: at(lastReminderAt),
    escalationLevel: 999999,
  })

  it('2通目は基準どおり1時間後', () => {
    const r = computeNextReminderAt(state(1, '2026-09-06T01:00:00Z'), {
      ...base,
      backoffEnabled: true,
      maxIntervalMinutes: 480,
    })
    expect(r.nextReminderAt?.toISOString()).toBe('2026-09-06T02:00:00.000Z')
  })

  it('3通目は2時間後', () => {
    const r = computeNextReminderAt(state(2, '2026-09-06T02:00:00Z'), {
      ...base,
      backoffEnabled: true,
      maxIntervalMinutes: 480,
    })
    expect(r.nextReminderAt?.toISOString()).toBe('2026-09-06T04:00:00.000Z')
  })

  /**
   * ここが要。保険（無通知の上限180分）をそのまま適用すると、
   * 間隔を8時間に広げても3時間で鳴ってしまい、バックオフが打ち消される。
   */
  it('保険がバックオフを打ち消さない', () => {
    const r = computeNextReminderAt(state(3, '2026-09-06T04:00:00Z'), {
      ...base,
      backoffEnabled: true,
      maxIntervalMinutes: 480,
    })
    // 4時間後（240分）。保険の180分に引き戻されない
    expect(r.nextReminderAt?.toISOString()).toBe('2026-09-06T08:00:00.000Z')
    expect(r.reason).toBe('INTERVAL')
  })

  it('バックオフOFFなら保険は従来どおり効く', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: at('2026-09-06T04:00:00Z'),
        firstUnrepliedAt: at('2026-09-06T00:00:00Z'),
        reminderCount: 3,
        lastReminderAt: at('2026-09-06T04:00:00Z'),
        escalationLevel: 999999,
      },
      { ...base, backoffEnabled: false, intervalMinutes: 600 },
    )
    // 間隔600分より保険180分が早いので、保険が勝つ
    expect(r.nextReminderAt?.toISOString()).toBe('2026-09-06T07:00:00.000Z')
    expect(r.reason).toBe('SILENCE_GUARD')
  })

  /**
   * バックオフで薄くするのは「同じ内容の繰り返し」だけ。
   * 段階が上がるエスカレーションは、間隔を広げても定刻どおり発火しなければならない。
   */
  it('エスカレーションはバックオフの影響を受けない', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: at('2026-09-06T00:00:00Z'),
        firstUnrepliedAt: at('2026-09-06T00:00:00Z'),
        reminderCount: 3,
        lastReminderAt: at('2026-09-06T02:00:00Z'),
        escalationLevel: 60,
      },
      { ...base, backoffEnabled: true, maxIntervalMinutes: 480, escalationThresholdsMinutes: [60, 180, 360] },
    )
    // 間隔なら 02:00 + 4時間 = 06:00 だが、3時間のエスカレーションが先に来る
    expect(r.nextReminderAt?.toISOString()).toBe('2026-09-06T03:00:00.000Z')
    expect(r.kind).toBe('ESCALATION')
  })
})
