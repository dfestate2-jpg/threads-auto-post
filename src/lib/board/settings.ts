/**
 * 追客ボードの設定。
 *
 * 仕様書に書いた数字は全部ここを通る。営業感覚とズレたときに
 * コードを直さず画面から変えられる、という状態を保つための層。
 */
import type { BoardSettings } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'
import { LADDER_OFF, parseLadder, type LadderTable, type NotifyTime } from './ladder'

export const BOARD_SETTINGS_ID = 'singleton'

/**
 * 既定値。スキーマの @default と同じ値をここにも置いてある。
 * 設定行がまだ無い環境（新規デプロイ直後）でも、読むだけで動くようにするため。
 */
export const DEFAULT_LADDERS = {
  5: '2',
  4: '3,5,7',
  3: '7,14,30',
  2: '14,30,end',
  1: 'off',
} as const

/** 設定行が無ければ既定値で作って返す */
export async function getBoardSettings(): Promise<BoardSettings> {
  const existing = await prisma.boardSettings.findUnique({ where: { id: BOARD_SETTINGS_ID } })
  if (existing) return existing
  return prisma.boardSettings.create({ data: { id: BOARD_SETTINGS_ID } })
}

/**
 * 判断に必要なものを1回で揃える。
 *
 * 1リクエストで何度も設定を読みに行かないよう、呼び出し側はこれを1回だけ
 * 作って持ち回す。
 */
export interface BoardContext {
  settings: BoardSettings
  table: LadderTable
  notify: NotifyTime
  timezone: string
  now: Date
}

export function buildLadderTable(settings: BoardSettings): LadderTable {
  return {
    5: parseLadder(settings.angle5Ladder, parseLadder(DEFAULT_LADDERS[5])),
    4: parseLadder(settings.angle4Ladder, parseLadder(DEFAULT_LADDERS[4])),
    3: parseLadder(settings.angle3Ladder, parseLadder(DEFAULT_LADDERS[3])),
    2: parseLadder(settings.angle2Ladder, parseLadder(DEFAULT_LADDERS[2])),
    1: parseLadder(settings.angle1Ladder, LADDER_OFF),
  }
}

export async function loadBoardContext(now = new Date()): Promise<BoardContext> {
  const [settings, app] = await Promise.all([getBoardSettings(), getSettings()])
  return {
    settings,
    table: buildLadderTable(settings),
    // 時・分が範囲外のまま保存されていても通知が止まらないよう、ここで丸める
    notify: {
      hour: clamp(settings.notifyHour, 0, 23, 9),
      minute: clamp(settings.notifyMinute, 0, 59, 0),
    },
    timezone: app.timezone,
    now,
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 通知本文の既定。設定で上書きできる */
export const DEFAULT_MESSAGE_TEMPLATE = `📞 {顧客名} 様（角度{角度}）
{経過}

{タスク}`

/**
 * 差し込みを埋める。
 *
 * 未対応の差し込みが書かれていても、そのまま文字として残す。
 * 空文字に潰すと「誰宛か分からない通知」になり、事故のほうが大きい。
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (whole, key: string) => values[key] ?? whole)
}
