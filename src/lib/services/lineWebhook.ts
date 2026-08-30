/**
 * LINE Webhook イベントの処理本体。
 *
 * 受け口は2つある（LINE公式アカウントから直接 / Lステップの転送経由）が、
 * イベントの解釈と状態遷移は完全に同じであるべきなので、ここに一本化する。
 */
import { ResolvedVia } from '@prisma/client'

import { getProfile, replyTextMessage } from '@/lib/line/client'
import type { LineWebhookEvent } from '@/lib/line/types'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { recordInboundMessage, recordOutboundMessage } from './conversation'
import { loadFollowUpContext, onCustomerInbound, onStaffOutbound, type FollowUpContext } from './followUp'
import { applyQuickAction } from './quickAction'
import { consumeLinkCode, linkResultMessage } from './staffLink'
import { groupIdMessage, groupWelcomeMessage, isGroupIdRequest } from '@/lib/domain/groupSetup'
import type { PolicyContext } from './policy'

/** イベントの timestamp がこれ以上ずれていたらリプレイとみなして拒否する */
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000

function textOf(event: LineWebhookEvent): string | null {
  const m = event.message
  if (!m) return null
  if (m.type === 'text') return m.text ?? null
  if (m.type === 'sticker') return '[スタンプ]'
  if (m.type === 'image') return '[画像]'
  if (m.type === 'video') return '[動画]'
  if (m.type === 'audio') return '[音声]'
  if (m.type === 'file') return `[ファイル] ${m.fileName ?? ''}`.trim()
  if (m.type === 'location') return '[位置情報]'
  return `[${m.type}]`
}

async function resolveProfile(userId: string): Promise<{ displayName?: string | null; pictureUrl?: string | null } | null> {
  const existing = await prisma.customer.findUnique({
    where: { lineUserId: userId },
    select: { displayName: true },
  })
  if (existing?.displayName) return null // 既に取得済みなら API を叩かない（レート節約）
  try {
    const profile = await getProfile(env.lineChannelAccessToken, userId)
    return profile ? { displayName: profile.displayName, pictureUrl: profile.pictureUrl ?? null } : null
  } catch {
    return null
  }
}

/** 署名の検証に成功したチャネル。応答（reply）に使うトークンを選ぶために使う */
export type ChannelKind = 'MAIN' | 'NOTIFY'

/**
 * 追客設定の遅延読み込み。
 * 1リクエストに複数イベントが入るため、必要になったときに1回だけ読む。
 */
type FollowUpLoader = () => Promise<FollowUpContext>

async function ack(event: LineWebhookEvent, channel: ChannelKind, text: string): Promise<void> {
  if (!event.replyToken) return
  const token = channel === 'NOTIFY' ? env.lineNotifyAccessToken : env.lineChannelAccessToken
  // 応答が返せなくても本処理は完了しているので握りつぶす（replyToken は約1分で失効する）
  await replyTextMessage(token, event.replyToken, text).catch(() => undefined)
}

/**
 * 社内LINE通知の「対応済みにする」ボタン。
 * 判定・状態遷移は services/quickAction 側にあり、ここは応答の出し分けだけを行う。
 */
async function handlePostback(event: LineWebhookEvent, channel: ChannelKind, ctx: PolicyContext): Promise<void> {
  const outcome = await applyQuickAction(
    { data: event.postback?.data, source: event.source, raw: { source: event.source, postback: event.postback } },
    ctx,
  )
  if (outcome.status === 'INVALID') {
    // 署名不正は攻撃または鍵のローテーション。応答は返さない
    console.warn('[line-webhook] postback の署名検証に失敗しました')
    return
  }
  await ack(event, channel, outcome.message)
}

/**
 * 社内スタッフのLINEユーザーIDかどうか。
 *
 * 社内通知を顧客対応と同じ公式アカウントから送る構成では、営業担当自身が
 * その公式アカウントの友だちになる。そのまま素通しすると
 * **営業担当の発言が「未返信の顧客」として登録され、自分宛にリマインドが鳴り続ける。**
 * 顧客として扱ってよいのは社外の人だけなので、入口で弾く。
 */
async function isInternalStaff(userId: string): Promise<boolean> {
  return (await prisma.staff.count({ where: { lineUserId: userId, active: true } })) > 0
}

/**
 * 社内通知チャネル（Bot②）に届いたイベント。
 *
 * こちらは**社内専用の連絡口**なので、顧客対応の対象には一切しない。
 * 素通しすると、社内の人間が「未返信の顧客」として一覧に並んでしまう。
 * ここで受け付けるのは担当者の連携コードだけ。
 */
async function handleInternalChannelEvent(event: LineWebhookEvent): Promise<void> {
  const source = event.source

  /**
   * グループ・複数人トークに招待された場合。
   * グループIDは画面のどこにも出ないため、ここで本人へ返信して伝える。
   * これが無いと「グループを通知先にする」設定が事実上できない。
   */
  if (source?.type === 'group' || source?.type === 'room') {
    const groupTarget = source.groupId ?? source.roomId
    if (!groupTarget) return
    if (event.type === 'join') {
      await ack(event, 'NOTIFY', groupWelcomeMessage(groupTarget))
      return
    }
    if (event.type === 'message' && event.message?.type === 'text' && isGroupIdRequest(event.message.text)) {
      await ack(event, 'NOTIFY', groupIdMessage(groupTarget))
    }
    // グループ内の通常の会話には反応しない
    return
  }

  const userId = source?.userId
  if (!userId || source.type !== 'user') return

  if (event.type === 'follow') {
    await ack(event, 'NOTIFY', '社内通知Botです。管理画面で発行した連携コードを送信してください。')
    return
  }
  if (event.type !== 'message' || event.message?.type !== 'text') return

  const result = await consumeLinkCode(event.message.text, userId)
  const message = linkResultMessage(result)
  // コードが含まれていない発言（雑談・スタンプ等）には何も返さない
  if (message) await ack(event, 'NOTIFY', message)
}

async function handleEvent(
  event: LineWebhookEvent,
  channel: ChannelKind,
  ctx: PolicyContext,
  followUp: FollowUpLoader,
): Promise<void> {
  // 社内グループからのボタン操作を受けるため、1対1トーク限定の判定より前に処理する
  if (event.type === 'postback') {
    await handlePostback(event, channel, ctx)
    return
  }

  // 社内通知チャネルからのイベントは顧客対応の対象外
  if (channel === 'NOTIFY') {
    await handleInternalChannelEvent(event)
    return
  }

  const userId = event.source?.userId
  // 1対1トーク以外（グループ/ルーム）は顧客対応の対象外
  if (!userId || event.source.type !== 'user') return

  // 社内スタッフ本人の発言を顧客の問い合わせとして扱わない
  if (await isInternalStaff(userId)) return

  switch (event.type) {
    case 'message': {
      if (!event.message) return
      const inbound = await recordInboundMessage(
        {
          lineUserId: userId,
          lineMessageId: event.message.id,
          messageType: event.message.type,
          text: textOf(event),
          sentAt: new Date(event.timestamp),
          raw: event as unknown,
          profile: await resolveProfile(userId),
        },
        ctx,
      )
      /**
       * 顧客から返信が来た＝追客の状況が変わった。
       * 「返信なし」「休眠」から復活させ、次回アクションを引き直すのはシステムの仕事で、
       * 営業マンにステータスを触らせない。【指示書 4】
       */
      if (!inbound.duplicate) {
        await onCustomerInbound(inbound.customerId, new Date(event.timestamp), await followUp())
      }
      return
    }
    case 'follow': {
      const profile = await resolveProfile(userId)
      await prisma.customer.upsert({
        where: { lineUserId: userId },
        create: {
          lineUserId: userId,
          displayName: profile?.displayName ?? null,
          pictureUrl: profile?.pictureUrl ?? null,
        },
        update: {
          blocked: false,
          ...(profile?.displayName ? { displayName: profile.displayName } : {}),
        },
      })
      return
    }
    case 'unfollow': {
      // ブロックされた顧客へは通知しても意味がないため、印を付けて送信対象から外す
      await prisma.customer.updateMany({ where: { lineUserId: userId }, data: { blocked: true } })
      return
    }
    /**
     * 拡張ポイント：
     * 標準の Messaging API では「担当者が LINE Official Account Manager から送った返信」は
     * Webhook に配信されない。LINE Module Channel 等でそれを受けられる環境では、
     * 送信イベントをここで OUTBOUND として取り込むことで完全自動判定になる。
     * 詳細は docs/07-line-reply-detection.md を参照。
     */
    case 'send':
    case 'sendMessage': {
      const customer = await prisma.customer.findUnique({ where: { lineUserId: userId }, select: { id: true } })
      if (!customer) return
      const sending = event.sendingMessage ?? event.message
      await recordOutboundMessage(
        {
          customerId: customer.id,
          text: sending?.text ?? null,
          messageType: sending?.type ?? 'text',
          sentAt: new Date(event.timestamp),
          lineMessageId: sending?.id ?? null,
          source: 'LINE_WEBHOOK',
          via: ResolvedVia.WEBHOOK,
          raw: event as unknown,
        },
        ctx,
      )
      await onStaffOutbound(customer.id, new Date(event.timestamp), null, await followUp())
      return
    }
    default:
      return
  }
}


/**
 * 受け取ったイベント列を順に処理する。
 *
 * 1件の失敗が他のイベントを巻き込まないよう、例外はここで握って記録に留める。
 * 呼び出し側は必ず 200 を返すこと（LINE / Lステップに再送を促さないため）。
 */
export async function processLineEvents(
  events: LineWebhookEvent[],
  channel: ChannelKind,
  ctx: PolicyContext,
  now = Date.now(),
): Promise<void> {
  let followUpContext: FollowUpContext | null = null
  const getFollowUpContext = async (): Promise<FollowUpContext> =>
    (followUpContext ??= await loadFollowUpContext(new Date(now)))

  for (const event of events) {
    try {
      if (Math.abs(now - event.timestamp) > MAX_CLOCK_SKEW_MS && !event.deliveryContext?.isRedelivery) {
        console.warn('[line-webhook] rejected stale event', { type: event.type })
        continue
      }

      // --- 冪等性：同じ webhookEventId は一度しか処理しない ---
      if (event.webhookEventId) {
        try {
          await prisma.webhookEvent.create({
            data: {
              webhookEventId: event.webhookEventId,
              eventType: event.type,
              isRedelivery: event.deliveryContext?.isRedelivery ?? false,
              raw: event as unknown as object,
            },
          })
        } catch {
          continue // 既に処理済み
        }
      }

      await handleEvent(event, channel, ctx, getFollowUpContext)

      if (event.webhookEventId) {
        await prisma.webhookEvent
          .update({ where: { webhookEventId: event.webhookEventId }, data: { processedAt: new Date() } })
          .catch(() => undefined)
      }
    } catch (e) {
      console.error('[line-webhook] event handling failed', { type: event.type, error: String(e) })
    }
  }
}
