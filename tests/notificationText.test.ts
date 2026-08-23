import { describe, expect, it } from 'vitest'

import { buildExcerpt, buildNotificationText } from '@/lib/domain/notificationText'
import { formatElapsedJa } from '@/lib/domain/time'
import { escalationDedupeKey, guardDedupeKey, routineDedupeKey, watchdogDedupeKey } from '@/lib/domain/dedupe'
import { buildWebhookPayload, detectWebhookFlavor } from '@/lib/notify/webhookPayload'

describe('経過時間の日本語表現', () => {
  it.each([
    [0, '0分'],
    [45, '45分'],
    [60, '1時間'],
    [90, '1時間30分'],
    [120, '2時間'],
    [1440, '1日'],
    [1560, '1日2時間'],
  ])('%i分 -> %s', (minutes, expected) => {
    expect(formatElapsedJa(minutes)).toBe(expected)
  })
})

describe('メッセージ抜粋', () => {
  it('改行を潰して1行にする', () => {
    expect(buildExcerpt('物件について\n聞きたいです', 60)).toBe('物件について 聞きたいです')
  })

  it('文字数上限で切り詰める', () => {
    expect(buildExcerpt('あ'.repeat(100), 10)).toBe(`${'あ'.repeat(10)}…`)
  })

  it('テキスト以外は代替表記になる', () => {
    expect(buildExcerpt(null, 60)).toBe('（テキスト以外のメッセージ）')
  })
})

describe('社内LINEへの通知本文', () => {
  const base = {
    customerName: '田中',
    unrepliedMinutes: 120,
    totalUnrepliedMinutes: 120,
    lastMessage: '〇〇について聞きたいです',
    assigneeName: '山田',
    reminderCount: 2,
    includeMessageBody: true,
    excerptLength: 60,
  }

  it('依頼された書式どおりに組み立てられる', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base })
    expect(text).toContain('⚠️ 公式LINE未返信リマインド')
    expect(text).toContain('顧客名：田中様')
    expect(text).toContain('未返信時間：2時間')
    expect(text).toContain('最終メッセージ：')
    expect(text).toContain('『〇〇について聞きたいです』')
    expect(text).toContain('担当者：山田')
    expect(text).toContain('👉 公式LINEを確認してください。')
  })

  it('担当者未設定でも通知先が分かる表記になる', () => {
    expect(buildNotificationText({ kind: 'ROUTINE', ...base, assigneeName: null })).toContain('担当者：未設定（社内共有）')
  })

  it('連投でカウントが再スタートしている場合は実際の放置時間も併記する', () => {
    const text = buildNotificationText({ kind: 'GUARD', ...base, unrepliedMinutes: 30, totalUnrepliedMinutes: 180 })
    expect(text).toContain('未返信時間：30分')
    expect(text).toContain('（最初の未返信から：3時間）')
  })

  it('エスカレーション時は種別と段階が分かる', () => {
    const text = buildNotificationText({
      kind: 'ESCALATION',
      ...base,
      escalationThresholdMinutes: 180,
      escalationRuleName: '3時間：担当者＋責任者へ通知',
    })
    expect(text).toContain('🚨 【エスカレーション】公式LINE未返信')
    expect(text).toContain('エスカレーション：3時間経過（3時間：担当者＋責任者へ通知）')
  })

  it('本文を含めない設定ではメッセージが載らない', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base, includeMessageBody: false })
    expect(text).not.toContain('〇〇について聞きたいです')
    expect(text).toContain('顧客名：田中様')
  })

  it('管理画面へのリンクを付けられる', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base, detailUrl: 'https://example.com/customers/abc' })
    expect(text).toContain('https://example.com/customers/abc')
  })
})

describe('冪等キー（二重通知の防止）', () => {
  const cycle = new Date('2026-08-24T01:00:00Z')

  it('同じサイクル・同じ回数なら同一キーになる', () => {
    expect(routineDedupeKey('conv1', cycle, 1)).toBe(routineDedupeKey('conv1', cycle, 1))
  })

  it('回数が違えば別キーになる', () => {
    expect(routineDedupeKey('conv1', cycle, 1)).not.toBe(routineDedupeKey('conv1', cycle, 2))
  })

  it('返信後の新しいサイクルでは別キーになる（次の通知が抑止されない）', () => {
    const nextCycle = new Date('2026-08-24T05:00:00Z')
    expect(routineDedupeKey('conv1', cycle, 1)).not.toBe(routineDedupeKey('conv1', nextCycle, 1))
  })

  it('種別が違えば衝突しない', () => {
    expect(routineDedupeKey('conv1', cycle, 1)).not.toBe(guardDedupeKey('conv1', cycle, 1))
  })

  it('エスカレーションは1サイクル1ルール1回に固定される', () => {
    const a = escalationDedupeKey('conv1', cycle, 'rule-3h')
    const b = escalationDedupeKey('conv1', cycle, 'rule-3h')
    expect(a).toBe(b)
    expect(a).not.toBe(escalationDedupeKey('conv1', cycle, 'rule-6h'))
  })

  it('watchdog は1時間に1回までに制限される', () => {
    const t1 = new Date('2026-08-24T01:05:00Z')
    const t2 = new Date('2026-08-24T01:55:00Z')
    const t3 = new Date('2026-08-24T02:05:00Z')
    expect(watchdogDedupeKey('conv1', cycle, t1)).toBe(watchdogDedupeKey('conv1', cycle, t2))
    expect(watchdogDedupeKey('conv1', cycle, t1)).not.toBe(watchdogDedupeKey('conv1', cycle, t3))
  })
})

describe('Webhook ペイロードの形式（社内通知チャネル）', () => {
  it('Slack は { text } 形式', () => {
    expect(detectWebhookFlavor('https://hooks.slack.com/services/T000/B000/xxxx')).toBe('SLACK')
    expect(buildWebhookPayload('https://hooks.slack.com/services/T000/B000/xxxx', 'テスト')).toEqual({
      text: 'テスト',
    })
  })

  it('Discord は { content } 形式', () => {
    expect(detectWebhookFlavor('https://discord.com/api/webhooks/1/abc')).toBe('DISCORD')
    expect(buildWebhookPayload('https://discord.com/api/webhooks/1/abc', 'テスト')).toEqual({ content: 'テスト' })
  })

  it('LINE WORKS は入れ子の content 形式', () => {
    expect(buildWebhookPayload('https://xxx.worksmobile.com/message/v1/bot/1/message', 'テスト')).toEqual({
      content: { type: 'text', text: 'テスト' },
    })
  })

  it('判別できない宛先は Slack 互換形式にフォールバックする', () => {
    expect(detectWebhookFlavor('https://chat.googleapis.com/v1/spaces/xxx')).toBe('SLACK')
    expect(detectWebhookFlavor('not-a-url')).toBe('SLACK')
  })

  it('長すぎる本文は切り詰める', () => {
    const payload = buildWebhookPayload('https://hooks.slack.com/x', 'あ'.repeat(5000)) as { text: string }
    expect(payload.text.length).toBeLessThanOrEqual(3801)
    expect(payload.text.endsWith('…')).toBe(true)
  })
})
