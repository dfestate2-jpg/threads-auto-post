import type { Metadata } from 'next'

import { THEME_INIT_SCRIPT } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: '追客管理システム',
  description: '不動産仲介の追客を自動で管理し、営業担当には今日やることだけを提示するシステム',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 明るさの印は描画前のスクリプトが付ける。サーバー側の出力とは
    // 必ず食い違うので、その1か所だけ警告を止める
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 中身は自分で書いた定数のみ。外から来た文字列は入らない */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
