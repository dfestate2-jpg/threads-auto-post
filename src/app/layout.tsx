import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: '追客管理システム',
  description: '不動産仲介の追客を自動で管理し、営業担当には今日やることだけを提示するシステム',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
