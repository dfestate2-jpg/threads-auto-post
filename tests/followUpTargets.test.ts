import { describe, expect, it } from 'vitest'

import { resolveFollowUpTargets, type ChannelTarget, type StaffTarget } from '@/lib/domain/escalation'

const assignee: StaffTarget = {
  id: 's1',
  name: '山田',
  lineUserId: 'U-yamada',
  notifyEnabled: true,
  active: true,
}

const groups: ChannelTarget[] = [{ id: 'g1', name: '社内グループ', type: 'LINE_GROUP', target: 'G-shanai' }]

describe('resolveFollowUpTargets（追客の期限通知の宛先）', () => {
  it('同報OFFなら担当者だけに送る', () => {
    const t = resolveFollowUpTargets({ assignee, groupChannels: groups, alwaysIncludeGroup: false })
    expect(t.map((x) => x.target)).toEqual(['U-yamada'])
  })

  it('同報ONなら担当者とグループの両方に送る', () => {
    const t = resolveFollowUpTargets({ assignee, groupChannels: groups, alwaysIncludeGroup: true })
    expect(t.map((x) => x.target)).toEqual(['U-yamada', 'G-shanai'])
  })

  it('担当者が未設定なら、同報OFFでもグループへ送る（誰にも届かないのを防ぐ）', () => {
    const t = resolveFollowUpTargets({ assignee: null, groupChannels: groups, alwaysIncludeGroup: false })
    expect(t.map((x) => x.target)).toEqual(['G-shanai'])
  })

  it('担当者が通知OFFなら、同報OFFでもグループへ送る', () => {
    const t = resolveFollowUpTargets({
      assignee: { ...assignee, notifyEnabled: false },
      groupChannels: groups,
      alwaysIncludeGroup: false,
    })
    expect(t.map((x) => x.target)).toEqual(['G-shanai'])
  })

  it('担当者が退職（無効）なら、同報OFFでもグループへ送る', () => {
    const t = resolveFollowUpTargets({
      assignee: { ...assignee, active: false },
      groupChannels: groups,
      alwaysIncludeGroup: false,
    })
    expect(t.map((x) => x.target)).toEqual(['G-shanai'])
  })

  it('担当者がLINE未連携なら、同報OFFでもグループへ送る', () => {
    const t = resolveFollowUpTargets({
      assignee: { ...assignee, lineUserId: null },
      groupChannels: groups,
      alwaysIncludeGroup: false,
    })
    expect(t.map((x) => x.target)).toEqual(['G-shanai'])
  })

  it('担当者もグループも無ければ空（呼び出し側が送信しない）', () => {
    const t = resolveFollowUpTargets({ assignee: null, groupChannels: [], alwaysIncludeGroup: true })
    expect(t).toEqual([])
  })

  it('グループが複数あっても重複した宛先は1回にまとめる', () => {
    const dup: ChannelTarget[] = [
      { id: 'g1', name: '社内グループ', type: 'LINE_GROUP', target: 'G-shanai' },
      { id: 'g2', name: '社内グループ（別名）', type: 'LINE_GROUP', target: 'G-shanai' },
    ]
    const t = resolveFollowUpTargets({ assignee: null, groupChannels: dup, alwaysIncludeGroup: true })
    expect(t.map((x) => x.target)).toEqual(['G-shanai'])
  })
})
