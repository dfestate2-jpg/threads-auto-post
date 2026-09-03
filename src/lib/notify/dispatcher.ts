import type { NotifyTarget } from '@/lib/domain/escalation'
import { env } from '@/lib/env'
import { pushTextMessage, pushTextWithActions, type LinePostbackAction } from '@/lib/line/client'
import { buildWebhookPayload } from './webhookPayload'

export interface DeliveryResult {
  target: NotifyTarget
  ok: boolean
  error?: string
}

async function sendWebhook(url: string, text: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    // 宛先サービス（Slack / Discord / LINE WORKS）に応じた形式で送る
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildWebhookPayload(url, text)),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`webhook responded ${res.status}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 社内LINE通知に付けるワンタップ操作。
 * LINE 宛先にのみ意味があり、Slack 等の Webhook 宛先では無視される。
 */
export interface QuickActionOptions {
  /** ボタンの上に出す短い案内文（160文字まで） */
  prompt: string
  actions: LinePostbackAction[]
}

async function sendOne(target: NotifyTarget, text: string, quick?: QuickActionOptions): Promise<void> {
  switch (target.channel) {
    case 'LINE_USER':
    case 'LINE_GROUP':
      if (quick && quick.actions.length > 0) {
        await pushTextWithActions(env.lineNotifyAccessToken, target.target, text, quick.prompt, quick.actions)
        return
      }
      await pushTextMessage(env.lineNotifyAccessToken, target.target, text)
      return
    case 'WEBHOOK':
      await sendWebhook(target.target, text)
      return
    default: {
      const never: never = target.channel
      throw new Error(`未対応の通知チャネル: ${String(never)}`)
    }
  }
}

/**
 * 全ての宛先へ通知を送る。
 *
 * - 1宛先の失敗が他の宛先を巻き込まないよう、個別に成否を返す。
 * - **1件でも成功すれば「通知できた」とみなす**（全滅した場合のみ失敗扱い）。
 *   一部の担当者に届かないことより、誰にも届かないことのほうが重大なため。
 */
export async function dispatchNotification(
  targets: NotifyTarget[],
  text: string,
  quick?: QuickActionOptions,
): Promise<{ results: DeliveryResult[]; anySucceeded: boolean }> {
  const results = await Promise.all(
    targets.map(async (target): Promise<DeliveryResult> => {
      try {
        await sendOne(target, text, quick)
        return { target, ok: true }
      } catch (e) {
        return { target, ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }),
  )
  return { results, anySucceeded: results.some((r) => r.ok) }
}

/** 主経路が全滅したときの最終手段。環境変数の冗長Webhookへ投げる */
export async function dispatchFallback(text: string): Promise<boolean> {
  const url = env.fallbackWebhookUrl
  if (!url) return false
  try {
    await sendWebhook(url, `[FALLBACK] 主要な通知経路が全滅しました\n\n${text}`)
    return true
  } catch {
    return false
  }
}
