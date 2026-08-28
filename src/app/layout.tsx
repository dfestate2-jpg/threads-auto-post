import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MARKET SENTIMENT — Retail vs Large Trader",
  description:
    "個人トレーダーと大口 (Large Trader / Institutional proxy) のポジションの向きを一目で比較するダッシュボード",
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-base text-[#e8ecf3]">{children}</body>
    </html>
  );
}
