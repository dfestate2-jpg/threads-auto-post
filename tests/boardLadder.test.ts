import { describe, expect, it } from 'vitest'

import {
  LADDER_OFF,
  daysForStreak,
  formatLadder,
  isAngle,
  isDueToday,
  nextDue,
  overdueDays,
  parseLadder,
  todayOrder,
  type LadderTable,
} from '@/lib/board/ladder'

const TZ = 'Asia/Tokyo'
const NOTIFY = { hour: 9, minute: 0 }

/** 仕様書 04節・09節の初期値そのまま */
const TABLE: LadderTable = {
  5: parseLadder('2'),
  4: parseLadder('3,5,7'),
  3: parseLadder('7,14,30'),
  2: parseLadder('14,30,end'),
  1: parseLadder('off'),
}

describe('角度の判定', () => {
  it('1〜5の整数だけを角度として認める', () => {
    expect(isAngle(1)).toBe(true)
    expect(isAngle(5)).toBe(true)
    expect(isAngle(0)).toBe(false)
    expect(isAngle(6)).toBe(false)
    expect(isAngle(3.5)).toBe(false)
    expect(isAngle('3')).toBe(false)
    expect(isAngle(null)).toBe(false)
  })
})

describe('間隔設定の読み取り', () => {
  it('カンマ区切りの日数を読む', () => {
    expect(parseLadder('3,5,7')).toEqual({ days: [3, 5, 7], whenExhausted: 'repeat', off: false })
  })

  it('末尾の end は打ち切りを意味する', () => {
    expect(parseLadder('14,30,end')).toEqual({ days: [14, 30], whenExhausted: 'end', off: false })
  })

  it('off は追わない', () => {
    expect(parseLadder('off')).toEqual(LADDER_OFF)
    expect(parseLadder('OFF')).toEqual(LADDER_OFF)
  })

  it('空白は無視する', () => {
    expect(parseLadder(' 3 , 5 ')).toEqual({ days: [3, 5], whenExhausted: 'repeat', off: false })
  })

  /**
   * 設定を打ち間違えたときに追客が黙って止まるのが一番困る。
   * 読めなければ既定へ倒し、例外は投げない。
   */
  it('壊れた設定は既定に倒れる。例外を投げない', () => {
    const fallback = parseLadder('7')
    expect(parseLadder('あ', fallback)).toEqual(fallback)
    expect(parseLadder('0', fallback)).toEqual(fallback)
    expect(parseLadder('-3', fallback)).toEqual(fallback)
    expect(parseLadder('1.5', fallback)).toEqual(fallback)
    expect(parseLadder('', fallback)).toEqual(fallback)
    expect(parseLadder(null, fallback)).toEqual(fallback)
    expect(parseLadder(undefined, fallback)).toEqual(fallback)
    expect(parseLadder('end', fallback)).toEqual(fallback)
  })

  it('文字列に戻せる', () => {
    expect(formatLadder(parseLadder('3,5,7'))).toBe('3,5,7')
    expect(formatLadder(parseLadder('14,30,end'))).toBe('14,30,end')
    expect(formatLadder(LADDER_OFF)).toBe('off')
  })
})

describe('反応がないときに間隔が空く', () => {
  it('角度4は 3日 → 5日 → 7日 と空き、以降は7日を繰り返す', () => {
    const l = TABLE[4]
    expect(daysForStreak(l, 0)).toBe(3)
    expect(daysForStreak(l, 1)).toBe(5)
    expect(daysForStreak(l, 2)).toBe(7)
    expect(daysForStreak(l, 3)).toBe(7)
    expect(daysForStreak(l, 99)).toBe(7)
  })

  it('角度5は空けずに2日おきのまま', () => {
    expect(daysForStreak(TABLE[5], 0)).toBe(2)
    expect(daysForStreak(TABLE[5], 5)).toBe(2)
  })

  it('角度2は 14日 → 30日 のあと打ち切られる', () => {
    expect(daysForStreak(TABLE[2], 0)).toBe(14)
    expect(daysForStreak(TABLE[2], 1)).toBe(30)
    expect(daysForStreak(TABLE[2], 2)).toBeNull()
  })

  it('角度1は最初から追わない', () => {
    expect(daysForStreak(TABLE[1], 0)).toBeNull()
  })
})

describe('次回追客日', () => {
  // 2026-09-06(日) 13:24 JST = 04:24 UTC
  const from = new Date('2026-09-06T04:24:00.000Z')

  it('角度5なら2日後の朝9時（日本時間）', () => {
    const r = nextDue({ angle: 5, streak: 0, from, table: TABLE, timezone: TZ, notify: NOTIFY })
    expect(r.days).toBe(2)
    // 9/8 09:00 JST = 9/8 00:00 UTC
    expect(r.at?.toISOString()).toBe('2026-09-08T00:00:00.000Z')
    expect(r.exhausted).toBe(false)
  })

  it('角度3なら1週間後', () => {
    const r = nextDue({ angle: 3, streak: 0, from, table: TABLE, timezone: TZ, notify: NOTIFY })
    expect(r.days).toBe(7)
    expect(r.at?.toISOString()).toBe('2026-09-13T00:00:00.000Z')
  })

  it('通知時刻の設定が効く', () => {
    const r = nextDue({ angle: 5, streak: 0, from, table: TABLE, timezone: TZ, notify: { hour: 18, minute: 30 } })
    // 9/8 18:30 JST = 9/8 09:30 UTC
    expect(r.at?.toISOString()).toBe('2026-09-08T09:30:00.000Z')
  })

  /**
   * 日本時間の深夜に実行されたとき、UTC基準で数えると1日ずれる。
   * 営業が見るのは日本時間なので、ここがずれると「明日」のはずが「今日」出る。
   */
  it('日本時間の深夜でも日付がずれない', () => {
    // 2026-09-07 00:30 JST = 2026-09-06 15:30 UTC
    const lateNight = new Date('2026-09-06T15:30:00.000Z')
    const r = nextDue({ angle: 5, streak: 0, from: lateNight, table: TABLE, timezone: TZ, notify: NOTIFY })
    // 9/7 から2日後 = 9/9
    expect(r.at?.toISOString()).toBe('2026-09-09T00:00:00.000Z')
  })

  it('角度1は追客しない。打ち切りとは区別する', () => {
    const r = nextDue({ angle: 1, streak: 0, from, table: TABLE, timezone: TZ, notify: NOTIFY })
    expect(r.at).toBeNull()
    expect(r.exhausted).toBe(false)
  })

  it('角度2を追い切ったら打ち切りとして返る', () => {
    const r = nextDue({ angle: 2, streak: 2, from, table: TABLE, timezone: TZ, notify: NOTIFY })
    expect(r.at).toBeNull()
    expect(r.exhausted).toBe(true)
  })
})

describe('期限の超過', () => {
  const now = new Date('2026-09-06T04:24:00.000Z') // 9/6 13:24 JST

  it('過ぎた日数を日本時間の日付で数える', () => {
    expect(overdueDays(new Date('2026-09-03T00:00:00.000Z'), now, TZ)).toBe(3)
    expect(overdueDays(new Date('2026-09-06T00:00:00.000Z'), now, TZ)).toBe(0)
  })

  it('未来の期限は0（マイナスにしない）', () => {
    expect(overdueDays(new Date('2026-09-20T00:00:00.000Z'), now, TZ)).toBe(0)
  })

  it('今日の朝9時が期限で、まだ朝8時でも超過0', () => {
    const morning = new Date('2026-09-05T23:00:00.000Z') // 9/6 08:00 JST
    expect(overdueDays(new Date('2026-09-06T00:00:00.000Z'), morning, TZ)).toBe(0)
  })
})

describe('今日やることに出すか', () => {
  const now = new Date('2026-09-06T04:24:00.000Z') // 9/6 13:24 JST

  it('今日ぶんは出す', () => {
    expect(isDueToday(new Date('2026-09-06T00:00:00.000Z'), now, TZ)).toBe(true)
  })

  it('過ぎたぶんも出す。消えたら追客漏れになる', () => {
    expect(isDueToday(new Date('2026-08-20T00:00:00.000Z'), now, TZ)).toBe(true)
  })

  it('明日ぶんは出さない', () => {
    expect(isDueToday(new Date('2026-09-07T00:00:00.000Z'), now, TZ)).toBe(false)
  })

  it('今日の23時59分が期限なら、まだ今日ぶんとして出す', () => {
    // 9/6 23:59 JST = 9/6 14:59 UTC
    expect(isDueToday(new Date('2026-09-06T14:59:00.000Z'), now, TZ)).toBe(true)
  })

  it('期限なしは出さない', () => {
    expect(isDueToday(null, now, TZ)).toBe(false)
  })
})

describe('今日やることの並び順', () => {
  it('期限が古いものが上。同じ期限なら角度の高いものが上', () => {
    const rows = [
      { name: 'ふつう', dueAt: new Date('2026-09-06T00:00:00.000Z'), angle: 3 },
      { name: '放置', dueAt: new Date('2026-08-20T00:00:00.000Z'), angle: 2 },
      { name: '同日で熱い', dueAt: new Date('2026-09-06T00:00:00.000Z'), angle: 5 },
    ]
    expect([...rows].sort(todayOrder).map((r) => r.name)).toEqual(['放置', '同日で熱い', 'ふつう'])
  })

  it('期限なしは最後に回る', () => {
    const rows = [
      { name: '期限なし', dueAt: null, angle: 5 },
      { name: '今日', dueAt: new Date('2026-09-06T00:00:00.000Z'), angle: 2 },
    ]
    expect([...rows].sort(todayOrder).map((r) => r.name)).toEqual(['今日', '期限なし'])
  })
})
