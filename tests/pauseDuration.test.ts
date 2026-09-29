import { describe, expect, it } from 'vitest'

import { MAX_PAUSE_MINUTES, resolvePauseUntil } from '@/lib/domain/pauseDuration'

const TZ = 'Asia/Tokyo'
/** 2026-09-29 14:00 JST */
const NOW = new Date('2026-09-29T05:00:00.000Z')

describe('resolvePauseUntil', () => {
  it('0以下は再開（期限なし）', () => {
    expect(resolvePauseUntil({ kind: 'minutes', minutes: 0 }, TZ, NOW)).toBeNull()
    expect(resolvePauseUntil({ kind: 'minutes', minutes: -10 }, TZ, NOW)).toBeNull()
  })

  it('指定した分だけ止まる', () => {
    const until = resolvePauseUntil({ kind: 'minutes', minutes: 60 }, TZ, NOW)
    expect(until?.toISOString()).toBe('2026-09-29T06:00:00.000Z')
  })

  it('1日（24時間）が選べる', () => {
    const until = resolvePauseUntil({ kind: 'minutes', minutes: 24 * 60 }, TZ, NOW)
    expect(until?.toISOString()).toBe('2026-09-30T05:00:00.000Z')
  })

  it('24時間を超える指定は24時間に丸める', () => {
    const until = resolvePauseUntil({ kind: 'minutes', minutes: MAX_PAUSE_MINUTES + 600 }, TZ, NOW)
    expect(until?.toISOString()).toBe('2026-09-30T05:00:00.000Z')
  })

  it('「今日いっぱい」はタイムゾーン基準のその日の終わりまで', () => {
    // 9/29 23:59:59.999 JST = 9/29 14:59:59.999 UTC
    const until = resolvePauseUntil({ kind: 'endOfDay' }, TZ, NOW)
    expect(until?.toISOString()).toBe('2026-09-29T14:59:59.999Z')
  })

  it('深夜に「今日いっぱい」を押しても最低1時間は止まる', () => {
    // 9/29 23:40 JST — 残り20分しかない
    const late = new Date('2026-09-29T14:40:00.000Z')
    const until = resolvePauseUntil({ kind: 'endOfDay' }, TZ, late)
    expect(until?.toISOString()).toBe('2026-09-29T15:40:00.000Z')
  })

  it('どの経路でも24時間を超えない', () => {
    for (const req of [
      { kind: 'minutes' as const, minutes: 100_000 },
      { kind: 'endOfDay' as const },
    ]) {
      const until = resolvePauseUntil(req, TZ, NOW)
      expect(until).not.toBeNull()
      expect(until!.getTime() - NOW.getTime()).toBeLessThanOrEqual(MAX_PAUSE_MINUTES * 60_000)
    }
  })
})
