import { describe, expect, it } from 'vitest'

import { describeShape, extractLineEvents } from '@/lib/line/relayPayload'

const EVENT = {
  type: 'message',
  timestamp: 1_756_200_000_000,
  source: { type: 'user', userId: 'U123' },
  webhookEventId: 'evt-1',
  message: { id: 'm1', type: 'text', text: 'こんにちは' },
}

describe('extractLineEvents', () => {
  it('LINE標準の形をそのまま受け取れる', () => {
    expect(extractLineEvents({ destination: 'U0', events: [EVENT] })).toEqual([EVENT])
  })

  it('イベント配列だけが来ても受け取れる', () => {
    expect(extractLineEvents([EVENT])).toEqual([EVENT])
  })

  it('イベント1件だけが来ても受け取れる', () => {
    expect(extractLineEvents(EVENT)).toEqual([EVENT])
  })

  it.each(['body', 'payload', 'data', 'webhook', 'original'])('%s で包まれていても取り出せる', (key) => {
    expect(extractLineEvents({ [key]: { events: [EVENT] } })).toEqual([EVENT])
  })

  it('JSON文字列で包まれていても取り出せる', () => {
    expect(extractLineEvents({ body: JSON.stringify({ events: [EVENT] }) })).toEqual([EVENT])
  })

  it('入れ子で包まれていても取り出せる', () => {
    expect(extractLineEvents({ data: { body: { events: [EVENT] } } })).toEqual([EVENT])
  })

  it('イベントの形をしていないものは混ぜない', () => {
    const events = extractLineEvents({ events: [EVENT, { type: 'message' }, null, 'x'] })
    expect(events).toEqual([EVENT])
  })

  it('取り出せないものは空配列になる（例外は投げない）', () => {
    for (const bad of [null, undefined, 0, 'text', {}, { events: [] }, { foo: { bar: 1 } }]) {
      expect(extractLineEvents(bad)).toEqual([])
    }
  })

  it('循環しうる深い入れ子でも停止する', () => {
    let nested: Record<string, unknown> = { events: [EVENT] }
    for (let i = 0; i < 10; i += 1) nested = { body: nested }
    expect(extractLineEvents(nested)).toEqual([]) // 深すぎるものは諦める（無限ループしない）
  })
})

describe('describeShape', () => {
  it('キーの構造だけを返し、値は含めない', () => {
    const shape = describeShape({ destination: 'U0', events: [EVENT] })
    expect(shape).toContain('destination')
    expect(shape).toContain('events')
    expect(shape).not.toContain('U0')
    expect(shape).not.toContain('こんにちは')
  })
})
