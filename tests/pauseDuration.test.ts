import { describe, expect, it } from 'vitest'

import { MAX_PAUSE_MINUTES, isPaused, resolvePause } from '@/lib/domain/pauseDuration'

const TZ = 'Asia/Tokyo'
/** 2026-09-29 14:00 JST */
const NOW = new Date('2026-09-29T05:00:00.000Z')

describe('resolvePause', () => {
  it('0以下は再開（期限なし・無期限でもない）', () => {
    expect(resolvePause({ kind: 'minutes', minutes: 0 }, TZ, NOW)).toEqual({ until: null, indefinite: false })
    expect(resolvePause({ kind: 'minutes', minutes: -10 }, TZ, NOW)).toEqual({ until: null, indefinite: false })
  })

  it('resume は再開', () => {
    expect(resolvePause({ kind: 'resume' }, TZ, NOW)).toEqual({ until: null, indefinite: false })
  })

  it('指定した分だけ止まる', () => {
    expect(resolvePause({ kind: 'minutes', minutes: 60 }, TZ, NOW).until?.toISOString()).toBe(
      '2026-09-29T06:00:00.000Z',
    )
  })

  it('1日（24時間）が選べる', () => {
    expect(resolvePause({ kind: 'minutes', minutes: 24 * 60 }, TZ, NOW).until?.toISOString()).toBe(
      '2026-09-30T05:00:00.000Z',
    )
  })

  it('24時間を超える指定は24時間に丸める', () => {
    expect(resolvePause({ kind: 'minutes', minutes: MAX_PAUSE_MINUTES + 600 }, TZ, NOW).until?.toISOString()).toBe(
      '2026-09-30T05:00:00.000Z',
    )
  })

  it('「今日いっぱい」はタイムゾーン基準のその日の終わりまで', () => {
    // 9/29 23:59:59.999 JST = 9/29 14:59:59.999 UTC
    expect(resolvePause({ kind: 'endOfDay' }, TZ, NOW).until?.toISOString()).toBe('2026-09-29T14:59:59.999Z')
  })

  it('深夜に「今日いっぱい」を押しても最低1時間は止まる', () => {
    const late = new Date('2026-09-29T14:40:00.000Z') // 23:40 JST
    expect(resolvePause({ kind: 'endOfDay' }, TZ, late).until?.toISOString()).toBe('2026-09-29T15:40:00.000Z')
  })

  it('無期限は期限を持たない', () => {
    expect(resolvePause({ kind: 'indefinite' }, TZ, NOW)).toEqual({ until: null, indefinite: true })
  })

  it('期限付きと無期限が同時に立つことはない', () => {
    for (const req of [
      { kind: 'minutes' as const, minutes: 120 },
      { kind: 'endOfDay' as const },
      { kind: 'indefinite' as const },
      { kind: 'resume' as const },
    ]) {
      const s = resolvePause(req, TZ, NOW)
      expect(s.until !== null && s.indefinite).toBe(false)
    }
  })

  it('期限付きはどの経路でも24時間を超えない', () => {
    for (const req of [{ kind: 'minutes' as const, minutes: 100_000 }, { kind: 'endOfDay' as const }]) {
      const { until } = resolvePause(req, TZ, NOW)
      expect(until).not.toBeNull()
      expect(until!.getTime() - NOW.getTime()).toBeLessThanOrEqual(MAX_PAUSE_MINUTES * 60_000)
    }
  })
})

describe('isPaused', () => {
  it('無期限なら、期限が無くても止まっている', () => {
    expect(isPaused({ until: null, indefinite: true }, NOW)).toBe(true)
  })

  it('無期限は時間が経っても止まったまま（自動では戻らない）', () => {
    const muchLater = new Date(NOW.getTime() + 30 * 86_400_000)
    expect(isPaused({ until: null, indefinite: true }, muchLater)).toBe(true)
  })

  it('期限が未来なら止まっている', () => {
    expect(isPaused({ until: new Date(NOW.getTime() + 60_000), indefinite: false }, NOW)).toBe(true)
  })

  it('期限が過去なら止まっていない', () => {
    expect(isPaused({ until: new Date(NOW.getTime() - 1), indefinite: false }, NOW)).toBe(false)
  })

  it('どちらも無ければ止まっていない', () => {
    expect(isPaused({ until: null, indefinite: false }, NOW)).toBe(false)
  })
})
