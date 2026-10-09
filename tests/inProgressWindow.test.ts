import { describe, expect, it } from 'vitest'

import { computeNextReminderAt } from '@/lib/domain/reminderSchedule'
import { calendar, jst, policy } from './helpers'

/**
 * 「対応中」の窓。
 *
 * 公式LINEからの返信はWebhookに流れてこないため、システムは営業が返信したことを
 * 知れない。だから ✅ のあとに顧客が返事をすると、従来はそこから新しい未返信
 * サイクルが始まり、やり取り1往復ごとにリマインドが出ていた。
 */
describe('対応中のあいだはリマインドを繰り延べる', () => {
  it('窓が予定より後なら、窓の終わりまで繰り延べる', () => {
    // 14:00 に顧客メッセージ → 本来は15:00。14:00に✅を押して17:00まで対応中
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-10-09T14:00:00'),
        firstUnrepliedAt: jst('2026-10-09T14:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
        quietUntil: jst('2026-10-09T17:00:00'),
      },
      policy(),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-10-09T17:00:00').toISOString())
    expect(r.reason).toBe('IN_PROGRESS')
  })

  it('窓が予定より前なら何も変えない（期限切れ後は普通のリマインドに戻る）', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-10-09T14:00:00'),
        firstUnrepliedAt: jst('2026-10-09T14:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
        quietUntil: jst('2026-10-09T14:30:00'),
      },
      policy(),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-10-09T15:00:00').toISOString())
    expect(r.reason).toBe('FIRST_REMINDER')
  })

  it('窓が無ければ従来どおり', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-10-09T14:00:00'),
        firstUnrepliedAt: jst('2026-10-09T14:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
      },
      policy(),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-10-09T15:00:00').toISOString())
  })

  it('エスカレーションも消さずに窓の終わりへ動かす', () => {
    // 未返信3時間でエスカレーションの閾値に到達する設定。窓が後ろにあれば後ろへずれる
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-10-09T10:00:00'),
        firstUnrepliedAt: jst('2026-10-09T10:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
        escalationLevel: 0,
        quietUntil: jst('2026-10-09T16:00:00'),
      },
      policy({ escalationThresholdsMinutes: [60, 180], firstDelayMinutes: 600 }),
    )
    // 11:00 のエスカレーションが消えず、16:00 へ繰り延べられる
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-10-09T16:00:00').toISOString())
    expect(r.reason).toBe('IN_PROGRESS')
  })

  it('保険（無通知の上限）も窓の終わりへ動かす', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-10-09T14:00:00'),
        firstUnrepliedAt: jst('2026-10-09T10:00:00'),
        reminderCount: 1,
        lastReminderAt: jst('2026-10-09T11:00:00'),
        quietUntil: jst('2026-10-09T18:00:00'),
      },
      policy({ maxSilenceGuardMinutes: 60 }),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-10-09T18:00:00').toISOString())
    expect(r.reason).toBe('IN_PROGRESS')
  })

  it('通知OFF（間隔0）は窓があっても null のまま', () => {
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-10-09T14:00:00'),
        firstUnrepliedAt: jst('2026-10-09T14:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
        quietUntil: jst('2026-10-09T17:00:00'),
      },
      policy({ intervalMinutes: 0 }),
    )
    expect(r.nextReminderAt).toBeNull()
  })

  it('窓の終わりが営業時間外なら、翌営業日の開始まで繰り延べる', () => {
    // 土 19:00 に✅ → 23:00 まで対応中。日曜は休みなので月 9:00
    const r = computeNextReminderAt(
      {
        awaitingSince: jst('2026-10-10T19:00:00'),
        firstUnrepliedAt: jst('2026-10-10T19:00:00'),
        reminderCount: 0,
        lastReminderAt: null,
        quietUntil: jst('2026-10-10T23:00:00'),
      },
      policy({ respectBusinessHours: true, calendar: calendar() }),
    )
    expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-10-12T09:00:00').toISOString())
  })

  it('やり取りが続いても窓の終わりは動かない（1押しでやり取り全体をカバーする）', () => {
    // 14:00に✅で17:00まで。15:00・16:00に顧客が追加メッセージを送っても17:00のまま
    for (const awaiting of ['2026-10-09T15:00:00', '2026-10-09T16:00:00']) {
      const r = computeNextReminderAt(
        {
          awaitingSince: jst(awaiting),
          firstUnrepliedAt: jst(awaiting),
          reminderCount: 0,
          lastReminderAt: null,
          quietUntil: jst('2026-10-09T17:00:00'),
        },
        policy(),
      )
      expect(r.nextReminderAt?.toISOString()).toBe(jst('2026-10-09T17:00:00').toISOString())
    }
  })
})
