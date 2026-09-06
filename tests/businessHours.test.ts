import { describe, expect, it } from 'vitest'

import {
  addBusinessMinutes,
  businessMinutesBetween,
  isWithinBusinessHours,
  nextBusinessInstant,
} from '@/lib/domain/businessHours'
import { calendar, jst } from './helpers'

describe('営業時間の判定', () => {
  const cal = calendar()

  it('営業時間内を正しく判定する（月曜 10:00 JST）', () => {
    expect(isWithinBusinessHours(jst('2026-08-24T10:00:00'), cal)).toBe(true)
  })

  it('開店前・閉店後は営業時間外', () => {
    expect(isWithinBusinessHours(jst('2026-08-24T08:59:00'), cal)).toBe(false)
    expect(isWithinBusinessHours(jst('2026-08-24T20:00:00'), cal)).toBe(false)
    expect(isWithinBusinessHours(jst('2026-08-24T23:30:00'), cal)).toBe(false)
  })

  it('日曜は休業（既定設定）', () => {
    expect(isWithinBusinessHours(jst('2026-08-23T12:00:00'), cal)).toBe(false)
  })

  it('祝日として登録された日は休業になる', () => {
    const withHoliday = calendar({ holidays: [{ dateKey: '2026-08-24', isOpen: false }] })
    expect(isWithinBusinessHours(jst('2026-08-24T12:00:00'), withHoliday)).toBe(false)
  })

  it('臨時営業日は曜日設定が休業でも営業扱いになる', () => {
    const withOpenDay = calendar({ holidays: [{ dateKey: '2026-08-23', isOpen: true }] }) // 日曜
    expect(isWithinBusinessHours(jst('2026-08-23T12:00:00'), withOpenDay)).toBe(true)
  })
})

describe('次の営業開始時刻', () => {
  const cal = calendar()

  it('営業時間内ならその時刻をそのまま返す', () => {
    const t = jst('2026-08-24T10:00:00')
    expect(nextBusinessInstant(t, cal).getTime()).toBe(t.getTime())
  })

  it('閉店後は翌営業日の開店時刻へ繰り延べる', () => {
    expect(nextBusinessInstant(jst('2026-08-24T21:00:00'), cal).toISOString()).toBe(
      jst('2026-08-25T09:00:00').toISOString(),
    )
  })

  it('土曜の夜は日曜を飛ばして月曜の開店時刻になる', () => {
    expect(nextBusinessInstant(jst('2026-08-22T21:00:00'), cal).toISOString()).toBe(
      jst('2026-08-24T09:00:00').toISOString(),
    )
  })

  it('祝日も飛ばす', () => {
    const cal2 = calendar({ holidays: [{ dateKey: '2026-08-24', isOpen: false }] })
    expect(nextBusinessInstant(jst('2026-08-22T21:00:00'), cal2).toISOString()).toBe(
      jst('2026-08-25T09:00:00').toISOString(),
    )
  })

  it('全曜日が休業でも通知を止めないため、時刻をそのまま返す（フェイルセーフ）', () => {
    const closed = calendar({
      hours: Object.fromEntries(
        ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { enabled: false, open: '09:00', close: '20:00' }]),
      ),
    })
    const t = jst('2026-08-24T03:00:00')
    expect(nextBusinessInstant(t, closed).getTime()).toBe(t.getTime())
  })
})

describe('営業時間だけを数える加算・差分', () => {
  const cal = calendar()

  it('営業時間内での加算は実時間と同じ', () => {
    expect(addBusinessMinutes(jst('2026-08-24T10:00:00'), 60, cal).toISOString()).toBe(
      jst('2026-08-24T11:00:00').toISOString(),
    )
  })

  it('閉店をまたぐ加算は翌営業日へ繰り越す', () => {
    // 19:30 + 60分 → 20:00 で閉店、残り30分は翌日 9:00 から
    expect(addBusinessMinutes(jst('2026-08-24T19:30:00'), 60, cal).toISOString()).toBe(
      jst('2026-08-25T09:30:00').toISOString(),
    )
  })

  it('営業時間外の差分は 0 分として数える', () => {
    expect(businessMinutesBetween(jst('2026-08-24T21:00:00'), jst('2026-08-24T23:00:00'), cal)).toBe(0)
  })

  it('日をまたぐ差分は営業時間分だけ積算する', () => {
    // 月 19:00 → 火 10:00 : 月の 60分 + 火の 60分 = 120分
    expect(businessMinutesBetween(jst('2026-08-24T19:00:00'), jst('2026-08-25T10:00:00'), cal)).toBe(120)
  })
})
