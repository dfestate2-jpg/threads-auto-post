import { describe, expect, it } from 'vitest'

import {
  currentEscalationLevel,
  matchedRules,
  newlyCrossedRules,
  resolveNotifyTargets,
  type ChannelTarget,
  type EscalationRuleInput,
  type StaffTarget,
} from '@/lib/domain/escalation'

// 依頼例：1時間→担当者 / 3時間→担当者＋責任者 / 6時間→管理者
const RULES: EscalationRuleInput[] = [
  { id: 'r1', name: '1時間', thresholdMinutes: 60, notifyAssignee: true, notifyManager: false, notifyAdmins: false, notifyGroup: false, enabled: true },
  { id: 'r2', name: '3時間', thresholdMinutes: 180, notifyAssignee: true, notifyManager: true, notifyAdmins: false, notifyGroup: false, enabled: true },
  { id: 'r3', name: '6時間', thresholdMinutes: 360, notifyAssignee: true, notifyManager: true, notifyAdmins: true, notifyGroup: true, enabled: true },
]

const assignee: StaffTarget = { id: 's1', name: '山田', lineUserId: 'Uassignee', notifyEnabled: true, active: true }
const manager: StaffTarget = { id: 's2', name: '佐藤部長', lineUserId: 'Umanager', notifyEnabled: true, active: true }
const admin: StaffTarget = { id: 's3', name: '管理者', lineUserId: 'Uadmin', notifyEnabled: true, active: true }
const group: ChannelTarget[] = [{ id: 'c1', name: '社内共通グループ', type: 'LINE_GROUP', target: 'Cgroup' }]
const fallback: ChannelTarget[] = [{ id: 'c2', name: '冗長Webhook', type: 'WEBHOOK', target: 'https://example.com/hook' }]

function resolve(elapsedMinutes: number, over: Partial<Parameters<typeof resolveNotifyTargets>[0]> = {}) {
  return resolveNotifyTargets({
    elapsedMinutes,
    rules: RULES,
    assignee,
    manager,
    admins: [admin],
    groupChannels: group,
    adminChannels: [],
    fallbackChannels: fallback,
    ...over,
  })
}

describe('エスカレーション段階の判定', () => {
  it('経過に達したルールだけを昇順で返す', () => {
    expect(matchedRules(200, RULES).map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('無効なルールは対象外', () => {
    const disabled = RULES.map((r) => (r.id === 'r2' ? { ...r, enabled: false } : r))
    expect(matchedRules(200, disabled).map((r) => r.id)).toEqual(['r1'])
  })

  it('現在の段階は到達済みの最大閾値', () => {
    expect(currentEscalationLevel(59, RULES)).toBe(0)
    expect(currentEscalationLevel(60, RULES)).toBe(60)
    expect(currentEscalationLevel(400, RULES)).toBe(360)
  })

  it('前回段階より上に新しく到達したルールだけを返す', () => {
    expect(newlyCrossedRules(200, 60, RULES).map((r) => r.id)).toEqual(['r2'])
    expect(newlyCrossedRules(200, 180, RULES)).toEqual([])
  })
})

describe('通知先の解決【仕様③】', () => {
  it('担当者が設定されていれば担当者へ通知する', () => {
    const t = resolve(60, { alwaysIncludeGroup: false })
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ channel: 'LINE_USER', target: 'Uassignee', role: 'ASSIGNEE' })
  })

  it('既定では担当者に加えて社内共通の通知先へも同報する（事務など担当者以外も返信するため）', () => {
    const t = resolve(60)
    expect(t.map((x) => x.target).sort()).toEqual(['Cgroup', 'Uassignee'])
  })

  it('同報を切ると担当者だけになる', () => {
    const t = resolve(60, { alwaysIncludeGroup: false })
    expect(t.map((x) => x.target)).toEqual(['Uassignee'])
  })

  it('担当者が社内共通の通知先にも入っていても二重には送らない', () => {
    const t = resolve(60, {
      groupChannels: [
        { id: 'c1', name: '営業全員', type: 'LINE_USER', target: 'Uassignee' },
        { id: 'c3', name: '事務', type: 'LINE_USER', target: 'Ujimu' },
      ],
    })
    expect(t.map((x) => x.target).sort()).toEqual(['Uassignee', 'Ujimu'])
  })

  it('グループが使えない環境でも、個人宛を複数登録すれば全員に届く', () => {
    const t = resolve(60, {
      assignee: null,
      manager: null,
      groupChannels: [
        { id: 'c1', name: '営業A', type: 'LINE_USER', target: 'Usales-a' },
        { id: 'c2', name: '営業B', type: 'LINE_USER', target: 'Usales-b' },
        { id: 'c3', name: '事務', type: 'LINE_USER', target: 'Ujimu' },
      ],
    })
    expect(t.map((x) => x.target).sort()).toEqual(['Ujimu', 'Usales-a', 'Usales-b'])
    expect(t.every((x) => x.channel === 'LINE_USER')).toBe(true)
  })

  it('担当者未設定なら社内共通グループへ通知する', () => {
    const t = resolve(60, { assignee: null, manager: null })
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ channel: 'LINE_GROUP', target: 'Cgroup', role: 'GROUP' })
  })

  it('担当者にLINEユーザーIDが無い場合も共通グループへ回る', () => {
    const t = resolve(60, { assignee: { ...assignee, lineUserId: null } })
    expect(t.map((x) => x.target)).toContain('Cgroup')
  })

  it('担当者が通知OFF・退職済みなら共通グループへ回る', () => {
    expect(resolve(60, { assignee: { ...assignee, notifyEnabled: false } })[0]?.target).toBe('Cgroup')
    expect(resolve(60, { assignee: { ...assignee, active: false } })[0]?.target).toBe('Cgroup')
  })

  it('3時間経過で担当者＋責任者になる', () => {
    const t = resolve(180, { alwaysIncludeGroup: false })
    expect(t.map((x) => x.target).sort()).toEqual(['Uassignee', 'Umanager'])
  })

  it('同報が有効なら3時間経過でも社内共通の通知先が含まれる', () => {
    const t = resolve(180)
    expect(t.map((x) => x.target).sort()).toEqual(['Cgroup', 'Uassignee', 'Umanager'])
  })

  it('6時間経過で管理者と共通グループが加わる', () => {
    const t = resolve(360)
    expect(t.map((x) => x.target).sort()).toEqual(['Cgroup', 'Uadmin', 'Uassignee', 'Umanager'])
  })

  it('同じ宛先が複数ルールに該当しても1回だけ通知する（二重通知の防止）', () => {
    const t = resolve(600)
    const keys = t.map((x) => `${x.channel}:${x.target}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('通知先が全て解決できない場合は冗長チャネルへフォールバックする（通知漏れの防止）', () => {
    const t = resolve(60, { assignee: null, manager: null, groupChannels: [], admins: [] })
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ channel: 'WEBHOOK', role: 'FALLBACK' })
  })

  it('冗長チャネルも無ければ空を返す（呼び出し側が要確認へ落とす）', () => {
    const t = resolve(60, { assignee: null, manager: null, groupChannels: [], admins: [], fallbackChannels: [] })
    expect(t).toEqual([])
  })
})
