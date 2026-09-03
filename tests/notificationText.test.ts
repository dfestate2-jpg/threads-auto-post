import { describe, expect, it } from 'vitest'

import { buildDigestText, buildExcerpt, buildNotificationText } from '@/lib/domain/notificationText'
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

  it('1行目・顧客と担当・本文・操作の案内が並ぶ', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base })
    expect(text.split('\n')[0]).toBe('⚠️ 未返信 2時間')
    expect(text).toContain('田中 様（担当：山田）')
    expect(text).toContain('『〇〇について聞きたいです』')
    expect(text).toContain('返信したら下のボタンをタップしてください。')
  })

  /** 情報が多いほど読み飛ばされる。行動を変えないものは載せない */
  it('リマインド回数と最新メッセージ基準の経過は載せない', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base, unrepliedMinutes: 30, totalUnrepliedMinutes: 180 })
    expect(text).not.toContain('リマインド回数')
    expect(text).not.toContain('30分')
  })

  /**
   * 連投されている案件ほど急ぐべきなのに、最新メッセージ基準だと数字が小さくなり
   * 軽く見える。経過時間は「最初の未返信から」の一本に統一する。
   */
  it('経過時間は最初の未返信からの時間で出す', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base, unrepliedMinutes: 5, totalUnrepliedMinutes: 300 })
    expect(text.split('\n')[0]).toBe('⚠️ 未返信 5時間')
  })

  it('担当者未設定でもその旨が分かる', () => {
    expect(buildNotificationText({ kind: 'ROUTINE', ...base, assigneeName: null })).toContain('田中 様（担当：未設定）')
  })

  it('エスカレーションでは印が強くなり、誰に広がったかが分かる', () => {
    const text = buildNotificationText({
      kind: 'ESCALATION',
      ...base,
      totalUnrepliedMinutes: 200,
      escalationNote: '責任者にも通知',
    })
    expect(text.split('\n')[0]).toBe('🚨 未返信 3時間20分／責任者にも通知')
  })

  it('24時間を超えるとさらに強い印になる', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base, totalUnrepliedMinutes: 1560 })
    expect(text.split('\n')[0]).toBe('🚨🚨 未返信 1日2時間')
  })

  it('連投中は本文でもそれが分かる', () => {
    const text = buildNotificationText({ kind: 'GUARD', ...base, unrepliedMinutes: 30, totalUnrepliedMinutes: 180 })
    expect(text.split('\n')[0]).toBe('⚠️ 未返信 3時間（メッセージ連投中）')
  })

  it('本文を含めない設定ではメッセージが載らない', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base, includeMessageBody: false })
    expect(text).not.toContain('〇〇について聞きたいです')
    expect(text).toContain('田中 様（担当：山田）')
  })

  it('管理画面へのリンクを付けられる', () => {
    const text = buildNotificationText({ kind: 'ROUTINE', ...base, detailUrl: 'https://example.com/customers/abc' })
    expect(text).toContain('https://example.com/customers/abc')
  })

  /** 宛先は管理者。原因を追える情報を落とさない */
  it('システム警告は詳しいまま出す', () => {
    const text = buildNotificationText({ kind: 'WATCHDOG', ...base })
    expect(text).toContain('🛠 【システム警告】未返信リマインドの配信が遅延しています')
    expect(text).toContain('リマインド回数：2回目')
    expect(text).toContain('受信状況')
  })
})

describe('まとめ通知（2回目以降）', () => {
  const entries = [
    { customerName: '鈴木一郎', totalUnrepliedMinutes: 120, assigneeName: '舛谷' },
    { customerName: '山田太郎', totalUnrepliedMinutes: 1560, assigneeName: '内田' },
    { customerName: '佐藤花子', totalUnrepliedMinutes: 360, assigneeName: null },
  ]

  it('件数と一覧が入る', () => {
    const text = buildDigestText(entries)
    expect(text.split('\n')[0]).toBe('⚠️ 未返信 3件（継続中）')
    expect(text).toContain('山田太郎 様 1日2時間（担当：内田）')
    expect(text).toContain('佐藤花子 様 6時間（担当：未設定）')
  })

  /** 上から読めば手を付ける順になるようにする */
  it('放置が長い順に並ぶ', () => {
    const text = buildDigestText(entries)
    const order = ['山田太郎', '佐藤花子', '鈴木一郎'].map((n) => text.indexOf(n))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('経過時間に応じて印が変わる', () => {
    const text = buildDigestText(entries)
    expect(text).toContain('🚨🚨 山田太郎')
    expect(text).toContain('🚨 佐藤花子')
    expect(text).toContain('⚠️ 鈴木一郎')
  })

  it('一覧のURLを付けられる', () => {
    expect(buildDigestText(entries, 'https://example.com/customers')).toContain('https://example.com/customers')
  })

  it('操作は一覧からと案内する', () => {
    expect(buildDigestText(entries)).toContain('対応済みにするには一覧から開いてください。')
  })

  it('1件でも成立する', () => {
    expect(buildDigestText([entries[0]!]).split('\n')[0]).toBe('⚠️ 未返信 1件（継続中）')
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
