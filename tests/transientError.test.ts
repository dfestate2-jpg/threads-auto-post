import { describe, expect, it } from 'vitest'

import { isTransientConnectionError } from '@/lib/prisma'

/**
 * サーバーレス環境では、凍結されたインスタンスが解凍されたときに
 * 最初のクエリだけが接続切れで失敗する。これを自動で再試行するための判定。
 * 「再試行してよいもの」と「してはいけないもの」を取り違えないことが重要。
 */
describe('一時的な接続エラーの判定', () => {
  it('本番で実際に出た Connection closed を再試行対象にする', () => {
    expect(isTransientConnectionError(new Error('Connection closed.'))).toBe(true)
  })

  it('接続切れを表すメッセージを再試行対象にする', () => {
    const messages = [
      'Server has closed the connection.',
      'Connection terminated unexpectedly',
      "Can't reach database server at `db.example.supabase.co`",
      'Timed out fetching a new connection from the connection pool',
      'read ECONNRESET',
      'socket hang up',
    ]
    for (const message of messages) {
      expect(isTransientConnectionError(new Error(message)), message).toBe(true)
    }
  })

  it('Prisma のエラーコードでも判定する', () => {
    for (const code of ['P1001', 'P1002', 'P1008', 'P1017', 'P2024']) {
      expect(isTransientConnectionError(Object.assign(new Error('接続の問題'), { code })), code).toBe(true)
    }
  })

  it('大文字小文字を区別しない', () => {
    expect(isTransientConnectionError(new Error('CONNECTION CLOSED'))).toBe(true)
  })

  /**
   * ここが取り違えると危険な側。
   * 業務上のエラーを再試行しても直らないうえ、原因が隠れて発見が遅れる。
   */
  it('一意制約違反は再試行しない', () => {
    expect(isTransientConnectionError(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))).toBe(false)
  })

  it('レコードが見つからないエラーは再試行しない', () => {
    expect(isTransientConnectionError(Object.assign(new Error('An operation failed'), { code: 'P2025' }))).toBe(false)
  })

  it('プログラムの不具合は再試行しない', () => {
    expect(isTransientConnectionError(new TypeError('undefined is not a function'))).toBe(false)
  })

  it('エラーでない値を渡しても落ちない', () => {
    expect(isTransientConnectionError(null)).toBe(false)
    expect(isTransientConnectionError(undefined)).toBe(false)
    expect(isTransientConnectionError('Connection closed')).toBe(false)
    expect(isTransientConnectionError(42)).toBe(false)
    expect(isTransientConnectionError({})).toBe(false)
  })
})
