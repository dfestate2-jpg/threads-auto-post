import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE } from '@/lib/auth/cookie'

/**
 * 一次防御。Cookie の有無だけを見て未ログインをログイン画面へ送る。
 * 署名検証は Node ランタイム側（各ページ・API）で必ず行う。
 */
export function middleware(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  // API・ログイン・静的ファイルは対象外（Webhook / Cron は独自認証）
  matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico).*)'],
}
