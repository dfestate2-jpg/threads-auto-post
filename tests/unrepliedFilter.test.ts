import { ReplyState } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { buildUnrepliedFilter } from '@/lib/services/unrepliedFilter'

const NOW = new Date('2026-10-13T05:00:00.000Z')

describe('buildUnrepliedFilter', () => {
  it('既定は未返信のみ', () => {
    const { where } = buildUnrepliedFilter({}, NOW)
    expect(where.replyState).toBe(ReplyState.AWAITING)
  })

  it('awaiting=0 なら返信済みも含める', () => {
    const { where } = buildUnrepliedFilter({ awaiting: '0' }, NOW)
    expect(where.replyState).toBeUndefined()
  })

  it('over は経過時間の下限になる', () => {
    const { where } = buildUnrepliedFilter({ over: '180' }, NOW)
    expect(where.firstUnrepliedAt).toEqual({ not: null, lte: new Date('2026-10-13T02:00:00.000Z') })
  })

  it('over が 0 や不正なら絞り込まない', () => {
    for (const over of ['0', '-5', 'abc', '']) {
      expect(buildUnrepliedFilter({ over }, NOW).where.firstUnrepliedAt).toBeUndefined()
    }
  })

  it('assignee=none は担当者なしを指す', () => {
    const { where } = buildUnrepliedFilter({ assignee: 'none' }, NOW)
    expect(where.customer).toEqual({ AND: [{ assigneeId: null }] })
  })

  it('担当者と検索を同時に指定しても、両方が残る', () => {
    // 以前は customer を2回書いていたため、後から広げたほうが担当者の
    // 絞り込みを黙って上書きしていた（担当者で絞ったつもりが全員になる）
    const { where } = buildUnrepliedFilter({ assignee: 'staff-1', q: '山田' }, NOW)
    const and = (where.customer as { AND: unknown[] }).AND
    expect(and).toHaveLength(2)
    expect(and[0]).toEqual({ assigneeId: 'staff-1' })
    expect(JSON.stringify(and[1])).toContain('山田')
  })

  it('検索は空白を落とす', () => {
    expect(buildUnrepliedFilter({ q: '   ' }, NOW).where.customer).toBeUndefined()
  })

  it('説明文に絞り込みの内容が出る（確認文にそのまま使う）', () => {
    const { description } = buildUnrepliedFilter({ over: '180', assignee: 'none', q: '田中' }, NOW)
    expect(description).toContain('未返信')
    expect(description).toContain('180分以上経過')
    expect(description).toContain('担当者なし')
    expect(description).toContain('田中')
  })

  it('絞り込みが無ければ説明は「すべて」ではなく未返信だけを示す', () => {
    expect(buildUnrepliedFilter({}, NOW).description).toBe('未返信')
    expect(buildUnrepliedFilter({ awaiting: '0' }, NOW).description).toBe('すべて')
  })
})
