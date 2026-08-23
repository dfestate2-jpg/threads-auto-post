import { describe, expect, it } from 'vitest'

import { computeNextReminderAt, isAwaitingReply, resolveIntervalMinutes } from '@/lib/domain/reminderSchedule'
import { calendar, jst, policy } from './helpers'

describe('未返信の判定【仕様①】', () => {
  it('顧客の最新メッセージが担当者の最新返信より新しければ未返信', () => {
    expect(isAwaitingReply(jst('2026-08-24T10:00:00'), jst('2026-08-24T09:00:00'))).toBe(true)
  })

  it('返信が顧客メッセージより新しければ返信済み', () => {
    expect(isAwaitingReply(jst('2026-08-24T10:00:00'), jst('2026-08-24T10:30:00'))).toBe(false)
  })

  it('一度も返信していなければ未返信', () => {
    expect(isAwaitingReply(jst('2026-08-24T10:00:00'), null)).toBe(true)
  })

  it('顧客メッセージが無ければ未返信ではない', () => {
    expect(isAwaitingReply(null, null)).toBe(false)
  })
})

describe('リマインド間隔の解決【仕様③・通知の工夫】', () => {
  it('顧客個別設定が無ければ全体設定に従う', () => {
    expect(resolveIntervalMinutes(null, 60)).toBe(60)
    expect(resolveIntervalMinutes(undefined, 120)).toBe(120)
  })

  it('顧客個別設定があれば優先する', () => {
    expect(resolveIntervalMinutes(180, 60)).toBe(180)
  })

  it('0 は「通知しない」として尊重される', () => {
    expect(resolveIntervalMinutes(0, 60)).toBe(0)
  })
})

describe('依頼仕様②のリマインド間隔シナリオ', () => {
  // 10:00 顧客メッセージ → 11:00 / 12:00 / 13:00 に通知 → 13:30 返信で停止
  const awaitingSince = jst('2026-08-24T10:00:00')
  const p = policy()

  it('1回目は受信の1時間後', () => {
    const r = computeNextReminderAt(
      { awaitingSince, firstUnrepliedAt: awaitingSince, reminderCount: 0, lastReminderAt: null },
      p,
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T11:00:00').toISOString())
    expect(r.reason).toBe('FIRST_REMINDER')
  })

  it('2回目は1回目の1時間後', () => {
    const r = computeNextReminderAt(
      { awaitingSince, firstUnrepliedAt: awaitingSince, reminderCount: 1, lastReminderAt: jst('2026-08-24T11:00:00') },
      p,
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T12:00:00').toISOString())
    expect(r.reason).toBe('INTERVAL')
  })

  it('3回目は2回目の1時間後', () => {
    const r = computeNextReminderAt(
      { awaitingSince, firstUnrepliedAt: awaitingSince, reminderCount: 2, lastReminderAt: jst('2026-08-24T12:00:00') },
      p,
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T13:00:00').toISOString())
  })

  it('通知間隔を2時間にすると2時間後になる', () => {
    const r = computeNextReminderAt(
      { awaitingSince, firstUnrepliedAt: awaitingSince, reminderCount: 1, lastReminderAt: jst('2026-08-24T11:00:00') },
      policy({ intervalMinutes: 120 }),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T13:00:00').toISOString())
  })

  it('「通知しない」を選ぶと予定が立たない', () => {
    const r = computeNextReminderAt(
      { awaitingSince, firstUnrepliedAt: awaitingSince, reminderCount: 0, lastReminderAt: null },
      policy({ intervalMinutes: 0 }),
    )
    expect(r.nextReminderAt).toBeNull()
    expect(r.reason).toBe('NOTIFICATION_DISABLED')
  })
})

describe('顧客の追加メッセージでカウントが再スタートする【仕様①】', () => {
  it('新しいメッセージの1時間後へ後ろ倒しになる', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T10:40:00'), // 追加メッセージ
        firstUnrepliedAt: jst('2026-08-24T10:00:00'), // 最初の未返信は動かさない
        reminderCount: 0,
        lastReminderAt: null,
      },
      policy(),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T11:40:00').toISOString())
  })

  it('直前に通知していれば、間隔未満で連続通知しない', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T11:10:00'),
        firstUnrepliedAt: jst('2026-08-24T10:00:00'),
        reminderCount: 1,
        lastReminderAt: jst('2026-08-24T11:00:00'),
      },
      policy(),
    )
    // 12:00（前回+1時間）と 12:10（最新+1時間）の遅い方
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T12:10:00').toISOString())
  })
})

describe('連投による通知先送りを打ち消す保険（SILENCE_GUARD）', () => {
  it('返信が無い限り、無通知が上限を超えない', () => {
    // 顧客が50分おきに送り続けると通常ロジックでは永久に通知されない
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T12:30:00'),
        firstUnrepliedAt: jst('2026-08-24T10:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
      },
      policy({ maxSilenceGuardMinutes: 180 }),
    )
    // 通常なら 13:30 だが、最初の未返信 10:00 + 3時間 = 13:00 で強制通知
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T13:00:00').toISOString())
    expect(r.kind).toBe('GUARD')
    expect(r.reason).toBe('SILENCE_GUARD')
  })

  it('保険を無効化（0）にすると通常ロジックのみになる', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T12:30:00'),
        firstUnrepliedAt: jst('2026-08-24T10:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
      },
      policy({ maxSilenceGuardMinutes: 0 }),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T13:30:00').toISOString())
  })
})

describe('エスカレーション閾値による前倒し', () => {
  it('通知間隔が3時間でも、1時間のエスカレーション設定があれば1時間で通知される', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T10:00:00'),
        firstUnrepliedAt: jst('2026-08-24T10:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
        escalationLevel: 0,
      },
      policy({ intervalMinutes: 180, firstDelayMinutes: 180, escalationThresholdsMinutes: [60, 180, 360] }),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T11:00:00').toISOString())
    expect(r.kind).toBe('ESCALATION')
  })

  it('発火済みの段階は再スケジュールしない', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T10:00:00'),
        firstUnrepliedAt: jst('2026-08-24T10:00:00'),
        reminderCount: 1,
        lastReminderAt: jst('2026-08-24T11:00:00'),
        escalationLevel: 60,
      },
      policy({ intervalMinutes: 180, firstDelayMinutes: 180, escalationThresholdsMinutes: [60, 180] }),
    )
    // 次の段階は 13:00（10:00 + 180分）
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T13:00:00').toISOString())
  })
})

describe('営業時間の反映', () => {
  const p = policy({ respectBusinessHours: true, calendar: calendar() })

  it('閉店後になる予定は翌営業日の開店時刻へ繰り延べる（スキップしない）', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T19:30:00'),
        firstUnrepliedAt: jst('2026-08-24T19:30:00'),
        reminderCount: 0,
        lastReminderAt: null,
      },
      p,
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-25T09:00:00').toISOString())
  })

  it('土曜夜の未返信は日曜を飛ばして月曜朝に通知される', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-22T19:30:00'),
        firstUnrepliedAt: jst('2026-08-22T19:30:00'),
        reminderCount: 0,
        lastReminderAt: null,
      },
      p,
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-24T09:00:00').toISOString())
  })

  it('経過時間を営業時間だけで数える設定では、閉店をまたいで加算される', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T19:30:00'),
        firstUnrepliedAt: jst('2026-08-24T19:30:00'),
        reminderCount: 0,
        lastReminderAt: null,
      },
      policy({ respectBusinessHours: true, countBusinessHoursOnly: true, maxSilenceGuardMinutes: 0 }),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-08-25T09:30:00').toISOString())
  })
})

describe('1サイクルの最大通知回数', () => {
  it('上限に達すると予定が立たなくなる', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T10:00:00'),
        firstUnrepliedAt: jst('2026-08-24T10:00:00'),
        reminderCount: 5,
        lastReminderAt: jst('2026-08-24T14:00:00'),
      },
      policy({ maxRemindersPerCycle: 5 }),
    )
    expect(r.nextReminderAt).toBeNull()
    expect(r.reason).toBe('MAX_REMINDERS_REACHED')
  })

  it('既定（0）では無制限に通知し続ける', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-08-24T10:00:00'),
        firstUnrepliedAt: jst('2026-08-24T10:00:00'),
        reminderCount: 99,
        lastReminderAt: jst('2026-08-24T14:00:00'),
      },
      policy(),
    )
    expect(r.nextReminderAt).not.toBeNull()
  })
})
