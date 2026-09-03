import { describe, expect, it } from 'vitest'

import {
  bucketOf,
  computePriority,
  overdueDays,
  reasonLabel,
  resolveNextAction,
  rulesForStatus,
  type FollowUpRuleLike,
} from '@/lib/domain/followUp'
import { endOfDayIn, startOfDayIn } from '@/lib/domain/time'
import { jst, TZ } from './helpers'

const DAY = 1440

/** 指示書10「電話後返信なし」のリズム：1日 → 3日 → 7日（電話）→ 14日 → 30日で休眠 */
const NO_REPLY_RULES: FollowUpRuleLike[] = [
  { status: 'NO_REPLY', step: 0, offsetMinutes: 1 * DAY, actionType: 'LINE', label: 'LINEで再アプローチ' },
  { status: 'NO_REPLY', step: 1, offsetMinutes: 3 * DAY, actionType: 'LINE', label: 'LINEで再アプローチ' },
  { status: 'NO_REPLY', step: 2, offsetMinutes: 7 * DAY, actionType: 'CALL', label: '電話でアプローチ' },
  { status: 'NO_REPLY', step: 3, offsetMinutes: 14 * DAY, actionType: 'LINE', label: '最終LINE' },
  { status: 'NO_REPLY', step: 4, offsetMinutes: 30 * DAY, actionType: 'SYSTEM', label: '休眠へ移行', transitionTo: 'DORMANT' },
]

/** 見積書待ち：24時間 → 48時間 → 72時間で営業マンへ通知 */
const QUOTE_RULES: FollowUpRuleLike[] = [
  { status: 'AWAITING_QUOTE', step: 0, offsetMinutes: 1 * DAY, actionType: 'LINE', label: '見積書の進捗連絡' },
  { status: 'AWAITING_QUOTE', step: 1, offsetMinutes: 2 * DAY, actionType: 'LINE', label: '見積書の再連絡' },
  { status: 'AWAITING_QUOTE', step: 2, offsetMinutes: 3 * DAY, actionType: 'CALL', label: '営業へ通知', notifyStaff: true },
]

const ALL_RULES = [...NO_REPLY_RULES, ...QUOTE_RULES]

describe('次回アクションの自動決定【指示書 6・10】', () => {
  const statusSince = jst('2026-08-01T10:00:00')

  it('ステータス開始からの経過分数で次回追客日が決まる（1日後 → 3日後 → 7日後）', () => {
    const at = (step: number) =>
      resolveNextAction(
        { status: 'NO_REPLY', statusSince, followUpStep: step, autoFollowEnabled: true },
        ALL_RULES,
      )

    expect(at(0).at).toEqual(jst('2026-08-02T10:00:00'))
    expect(at(0).type).toBe('LINE')
    expect(at(1).at).toEqual(jst('2026-08-04T10:00:00'))
    expect(at(2).at).toEqual(jst('2026-08-08T10:00:00'))
    expect(at(2).type).toBe('CALL')
  })

  it('ステータスが違えばそのステータスのリズムが使われる', () => {
    const next = resolveNextAction(
      { status: 'AWAITING_QUOTE', statusSince, followUpStep: 2, autoFollowEnabled: true },
      ALL_RULES,
    )
    expect(next.at).toEqual(jst('2026-08-04T10:00:00'))
    expect(next.rule?.notifyStaff).toBe(true)
  })

  it('ステップを消化しきったら「要判断」になり、黙って消えない', () => {
    const next = resolveNextAction(
      { status: 'NO_REPLY', statusSince, followUpStep: 5, autoFollowEnabled: true },
      ALL_RULES,
    )
    expect(next.at).toBeNull()
    expect(next.exhausted).toBe(true)
  })

  it('成約・失注は追客対象外', () => {
    for (const status of ['CONTRACTED', 'LOST'] as const) {
      const next = resolveNextAction({ status, statusSince, followUpStep: 0, autoFollowEnabled: true }, ALL_RULES)
      expect(next.at).toBeNull()
      expect(next.exhausted).toBe(false)
    }
  })

  it('自動追客をオフにした顧客には次回アクションを設定しない', () => {
    const next = resolveNextAction(
      { status: 'NO_REPLY', statusSince, followUpStep: 0, autoFollowEnabled: false },
      ALL_RULES,
    )
    expect(next.at).toBeNull()
  })

  it('顧客からのLINEに未返信なら、どのルールよりも優先して「返信する」が出る', () => {
    const inboundAt = jst('2026-08-03T09:00:00')
    const next = resolveNextAction(
      {
        status: 'NO_REPLY',
        statusSince,
        followUpStep: 0,
        autoFollowEnabled: true,
        awaitingReplySince: inboundAt,
      },
      ALL_RULES,
    )
    expect(next.at).toEqual(inboundAt)
    expect(next.type).toBe('LINE')
    expect(next.note).toContain('返信')
  })

  it('無効化したルールは飛ばされる', () => {
    const disabled = ALL_RULES.map((r) => (r.step === 0 && r.status === 'NO_REPLY' ? { ...r, enabled: false } : r))
    const remaining = rulesForStatus(disabled, 'NO_REPLY')
    expect(remaining).toHaveLength(4)
    expect(remaining[0]?.offsetMinutes).toBe(3 * DAY)
  })
})

describe('追客優先度の自動判定【指示書 12】', () => {
  const now = jst('2026-08-10T11:00:00')
  const startOfToday = startOfDayIn(TZ, now)
  const endOfToday = endOfDayIn(TZ, now)
  const base = { now, startOfToday, endOfToday, autoFollowEnabled: true }

  it('期限超過は優先度が一段上がる', () => {
    expect(computePriority({ ...base, status: 'PROPOSING', nextActionAt: jst('2026-08-10T09:00:00') })).toBe('B')
    expect(computePriority({ ...base, status: 'PROPOSING', nextActionAt: jst('2026-08-08T09:00:00') })).toBe('A')
  })

  it('期限がまだ先の顧客は自動追客（C）に落ちる', () => {
    expect(computePriority({ ...base, status: 'PROPOSING', nextActionAt: jst('2026-08-20T09:00:00') })).toBe('C')
  })

  it('申込・見積書待ちなど決まる直前の顧客は今日対応（A）', () => {
    expect(computePriority({ ...base, status: 'APPLIED', nextActionAt: jst('2026-08-10T15:00:00') })).toBe('A')
    expect(computePriority({ ...base, status: 'AWAITING_QUOTE', nextActionAt: jst('2026-08-09T15:00:00') })).toBe('S')
  })

  it('引越し希望が近い顧客は優先度が上がる', () => {
    expect(
      computePriority({
        ...base,
        status: 'PROPOSING',
        nextActionAt: jst('2026-08-10T15:00:00'),
        moveInBy: jst('2026-09-01T00:00:00'),
      }),
    ).toBe('A')
  })

  it('顧客を待たせている（未返信）なら無条件で最優先', () => {
    expect(
      computePriority({
        ...base,
        status: 'DORMANT',
        nextActionAt: jst('2026-09-30T09:00:00'),
        awaitingOurReply: true,
      }),
    ).toBe('S')
  })

  it('手動で固定した優先度が最も強い', () => {
    expect(
      computePriority({ ...base, status: 'DORMANT', nextActionAt: jst('2026-09-30T09:00:00'), override: 'S' }),
    ).toBe('S')
  })

  it('成約・失注は追客対象外（C）', () => {
    expect(computePriority({ ...base, status: 'CONTRACTED', nextActionAt: null })).toBe('C')
  })

  it('ルールを消化しきった顧客は今日の判断対象（A以上）になる', () => {
    expect(computePriority({ ...base, status: 'DORMANT', nextActionAt: null })).toBe('A')
  })
})

describe('今日やることの仕分け【指示書 7・11】', () => {
  const now = jst('2026-08-10T11:00:00')
  const startOfToday = startOfDayIn(TZ, now)
  const endOfToday = endOfDayIn(TZ, now)
  const base = { startOfToday, endOfToday, autoFollowEnabled: true }

  it('昨日以前が期限なら期限超過', () => {
    expect(
      bucketOf({ ...base, status: 'PROPOSING', priority: 'A', nextActionAt: jst('2026-08-09T23:59:00') }),
    ).toBe('OVERDUE')
  })

  it('今日中の期限は優先度で最優先／通常に分かれる', () => {
    expect(bucketOf({ ...base, status: 'PROPOSING', priority: 'S', nextActionAt: jst('2026-08-10T18:00:00') })).toBe('TOP')
    expect(bucketOf({ ...base, status: 'PROPOSING', priority: 'B', nextActionAt: jst('2026-08-10T18:00:00') })).toBe('NORMAL')
  })

  it('明日以降が期限なら自動追客中', () => {
    expect(bucketOf({ ...base, status: 'PROPOSING', priority: 'C', nextActionAt: jst('2026-08-11T09:00:00') })).toBe('AUTO')
  })

  it('次回アクションが無い顧客は要判断として必ず表示する', () => {
    expect(bucketOf({ ...base, status: 'DORMANT', priority: 'A', nextActionAt: null })).toBe('NEEDS_DECISION')
  })

  it('成約・失注と自動追客オフは今日の画面に出さない', () => {
    expect(bucketOf({ ...base, status: 'CONTRACTED', priority: 'C', nextActionAt: null })).toBe('NONE')
    expect(bucketOf({ ...base, autoFollowEnabled: false, status: 'ON_HOLD', priority: 'C', nextActionAt: null })).toBe('NONE')
  })
})

describe('画面表示の補助', () => {
  it('「見積書待ち 3日」のような理由文を作る', () => {
    expect(reasonLabel('AWAITING_QUOTE', jst('2026-08-07T10:00:00'), jst('2026-08-10T11:00:00'))).toBe('見積書待ち 3日')
  })

  it('1日未満は時間で表す', () => {
    expect(reasonLabel('VIEWED', jst('2026-08-10T05:00:00'), jst('2026-08-10T11:00:00'))).toBe('内見済 6時間')
  })

  it('期限超過の日数を数える', () => {
    const startOfToday = startOfDayIn(TZ, jst('2026-08-10T11:00:00'))
    expect(overdueDays(jst('2026-08-07T10:00:00'), startOfToday)).toBe(3)
    expect(overdueDays(jst('2026-08-10T09:00:00'), startOfToday)).toBe(0)
    expect(overdueDays(null, startOfToday)).toBe(0)
  })
})
