import { describe, expect, it } from 'vitest'

import { groupIdMessage, groupWelcomeMessage, isGroupIdRequest } from '@/lib/domain/groupSetup'

const GROUP_ID = 'Cbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('isGroupIdRequest', () => {
  it.each(['通知先ID', '通知先IDを教えて', 'グループID', 'グループIDは？', 'つうちさきID'])(
    '「%s」はID要求として扱う',
    (text) => {
      expect(isGroupIdRequest(text)).toBe(true)
    },
  )

  it('普通の会話には反応しない', () => {
    for (const text of [null, undefined, '', 'おつかれさまです', '山田様に返信しました', 'ID', 'よろしく']) {
      expect(isGroupIdRequest(text)).toBe(false)
    }
  })
})

describe('案内メッセージ', () => {
  it('招待時の案内にグループIDと登録場所が含まれる', () => {
    const msg = groupWelcomeMessage(GROUP_ID)
    expect(msg).toContain(GROUP_ID)
    expect(msg).toContain('通知チャネル')
    expect(msg).toContain('通知先ID')
  })

  it('聞き直し時はIDだけを返す', () => {
    expect(groupIdMessage(GROUP_ID)).toContain(GROUP_ID)
    expect(groupIdMessage(GROUP_ID).split('\n')).toHaveLength(2)
  })
})
