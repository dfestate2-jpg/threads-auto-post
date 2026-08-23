import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: '公式LINE 未返信リマインド管理',
  description: '公式LINEの未返信を検知して社内へリマインドする管理システム',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
