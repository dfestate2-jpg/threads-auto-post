export interface LineSource {
  type: 'user' | 'group' | 'room'
  userId?: string
  groupId?: string
  roomId?: string
}

export interface LineMessageContent {
  id: string
  type: string
  text?: string
  stickerId?: string
  packageId?: string
  fileName?: string
}

export interface LineWebhookEvent {
  type: string
  mode?: string
  timestamp: number
  source: LineSource
  webhookEventId?: string
  deliveryContext?: { isRedelivery: boolean }
  replyToken?: string
  message?: LineMessageContent
  /** LINE Module Channel 等の拡張で送信メッセージを通知する場合に使う */
  sendingMessage?: LineMessageContent
}

export interface LineWebhookBody {
  destination?: string
  events: LineWebhookEvent[]
}

export interface LineProfile {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}
