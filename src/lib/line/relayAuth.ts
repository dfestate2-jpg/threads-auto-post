/**
 * Lステップ経由で届いた Webhook の受け入れ判定。
 *
 * 転送時に `x-line-signature` がそのまま付いてくるかは公開資料で確定できないため、
 * **2つの経路を用意し、強いほうを優先する。**
 *
 *   ① LINE署名が付いていて検証も通る → 最も強い。本物であることが暗号的に確かめられる
 *   ② 転送用トークンが一致する       → URL/ヘッダに載せた共有秘密。Lステップが署名を落とす場合の経路
 *
 * どちらも通らなければ 401。**「とりあえず通す」は絶対にしない**
 * ——顧客の会話状態を書き換える入口なので、ここだけは通知漏れより誤受理のほうが重い。
 *
 * 【署名が合わなかったときにトークンへ落とす理由】
 * 転送されてくる署名は「顧客対応チャネル」のものだが、Lステップ共存構成では
 * そのチャネルシークレットを設定しない運用もありうる。その状態で
 * 「署名が付いているのに合わない＝偽装」と決めつけて弾くと、
 * **正規の顧客メッセージを1件残らず落とす**（実際に導入時これで全滅した）。
 * 署名の不一致は「偽装」と「照合する鍵が無い」を区別できない以上、
 * ここで打ち切ってはいけない。
 *
 * 安全性は下がらない。トークンを知っている相手は、そもそも署名を付けずに
 * POST すれば受理される。つまりこの分岐が防いでいたのは
 * 「正しいトークンを持ちながら、わざわざ壊れた署名を付けてくる相手」だけで、
 * そんな攻撃者は存在しない。防御としては空振りで、事故だけを生んでいた。
 */
import { resolveChannelBySignature, safeEqual } from './signature'

export type RelayAuthResult =
  | { ok: true; via: 'LINE_SIGNATURE'; channel: 'MAIN' | 'NOTIFY' }
  | { ok: true; via: 'RELAY_TOKEN' }
  | { ok: false; reason: 'NO_CREDENTIAL' | 'BAD_SIGNATURE' | 'BAD_TOKEN' }

export interface RelayAuthInput {
  rawBody: string
  /** `x-line-signature` ヘッダー（無ければ null） */
  signature: string | null
  /** ヘッダー or クエリから取り出した転送用トークン（無ければ null） */
  presentedToken: string | null
  /** 未設定なら署名経路は使わず、転送用トークンだけで判定する */
  channelSecret?: string
  notifyChannelSecret?: string
  /** 未設定ならトークン経路は無効（署名のみ受理） */
  expectedToken?: string
}

export function authenticateRelay(input: RelayAuthInput): RelayAuthResult {
  /**
   * 署名が付いていても、照合する鍵が1つも無ければ検証しようがない。
   * その場合は署名を無いものとして扱い、転送用トークンでの判定に進む。
   */
  const canVerifySignature = Boolean(input.channelSecret || input.notifyChannelSecret)
  const tokenMatches = Boolean(
    input.expectedToken && input.presentedToken && safeEqual(input.presentedToken, input.expectedToken),
  )

  if (input.signature && canVerifySignature) {
    const channel = resolveChannelBySignature(input.rawBody, input.signature, {
      main: input.channelSecret,
      notify: input.notifyChannelSecret,
    })
    if (channel) return { ok: true, via: 'LINE_SIGNATURE', channel }
    // 合わなかった場合でも、共有秘密であるトークンが一致するなら受理する
    if (tokenMatches) return { ok: true, via: 'RELAY_TOKEN' }
    return { ok: false, reason: 'BAD_SIGNATURE' }
  }

  if (!input.expectedToken) return { ok: false, reason: 'NO_CREDENTIAL' }
  if (!input.presentedToken) return { ok: false, reason: 'NO_CREDENTIAL' }
  return tokenMatches ? { ok: true, via: 'RELAY_TOKEN' } : { ok: false, reason: 'BAD_TOKEN' }
}

/** ヘッダーとクエリ文字列の両方からトークンを拾う（転送側がどちらしか使えなくても動くように） */
export function readPresentedToken(request: { headers: Headers; url: string }): string | null {
  const header =
    request.headers.get('x-relay-token') ??
    request.headers.get('x-lstep-token') ??
    request.headers.get('x-webhook-token')
  if (header) return header
  try {
    return new URL(request.url).searchParams.get('token')
  } catch {
    return null
  }
}
