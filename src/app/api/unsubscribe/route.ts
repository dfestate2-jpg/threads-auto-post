/**
 * 配信停止の受付。**ログイン不要**で、いつでも動くこと。
 *
 * - GET  : 確認画面を返すだけ。ここで停止処理はしない。
 *          メールスキャナやセキュリティ製品がリンクを自動で開くため、
 *          GET で停止させると本人の意思と無関係に停止されてしまう。
 * - POST : 実際に停止する。RFC 8058（List-Unsubscribe-Post）のワンクリック配信停止も
 *          この POST に届く。Gmail / Yahoo の一括送信者要件はこれで満たす。
 *
 * 何度呼ばれても結果は同じ（冪等）。
 */
import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { parseUnsubscribeToken } from '@/lib/email/unsubscribe'
import { unsubscribeContact } from '@/lib/services/contacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function page(title: string, message: string, form: string | null): NextResponse {
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>${title}</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;">
<div style="max-width:480px;margin:64px auto;padding:32px 24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
<h1 style="margin:0 0 16px;font-size:18px;color:#0f172a;">${title}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.8;color:#334155;">${message}</p>
${form ?? ''}
</div></body></html>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('t')
  const payload = parseUnsubscribeToken(token, env.unsubscribeSecret)
  if (!payload) {
    return page(
      'リンクが無効です',
      'このリンクは無効か、期限切れの可能性があります。お手数ですが、届いたメールに返信いただければ手作業で停止いたします。',
      null,
    )
  }

  const form = `<form method="post" action="/api/unsubscribe">
<input type="hidden" name="t" value="${(token ?? '').replace(/"/g, '&quot;')}" />
<button type="submit" style="width:100%;padding:12px 16px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">配信を停止する</button>
</form>`
  return page(
    '配信停止の確認',
    '今後、物件情報のメールをお送りしないようにします。下のボタンを押すと手続きが完了します。',
    form,
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  // ワンクリック配信停止（RFC 8058）は form-urlencoded、確認画面からも form-urlencoded。
  // トークンはクエリにも body にも入りうるので両方見る。
  const url = new URL(request.url)
  let token = url.searchParams.get('t')
  try {
    const body = await request.text()
    if (body) {
      const params = new URLSearchParams(body)
      token = params.get('t') ?? token
    }
  } catch {
    // 本文が読めなくてもクエリのトークンで処理を続ける
  }

  const payload = parseUnsubscribeToken(token, env.unsubscribeSecret)
  if (!payload) {
    return page('リンクが無効です', 'お手数ですが、届いたメールに返信いただければ手作業で停止いたします。', null)
  }

  const result = await unsubscribeContact(payload.c, payload.k ? `配信 ${payload.k} のリンクから停止` : '配信停止リンクから停止')
  if (!result) {
    // 対象が見つからない場合も「停止済み」として扱う。ここで存在有無を漏らさない
    return page('配信を停止しました', '今後、物件情報のメールはお送りしません。ご利用ありがとうございました。', null)
  }

  return page(
    '配信を停止しました',
    '今後、物件情報のメールはお送りしません。<br />再度お受け取りをご希望の場合は、担当者までご連絡ください。',
    null,
  )
}
