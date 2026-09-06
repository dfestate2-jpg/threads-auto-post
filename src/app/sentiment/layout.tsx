import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MARKET SENTIMENT — Retail vs Large Trader",
  description:
    "個人トレーダーと大口 (Large Trader / Institutional proxy) のポジションの向きを一目で比較するダッシュボード",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
};

/**
 * ダッシュボードは常に暗い配色で見る前提の画面なので、追客管理側の
 * 明暗切り替えには乗せず、この配下だけを sentiment-root で塗り分ける。
 *
 * root layout（追客管理側）の body 配色を打ち消す必要があるため、
 * 色は globals.css の .sentiment-root に置いて 1 か所にまとめてある。
 */
export default function SentimentLayout({ children }: { children: React.ReactNode }) {
  return <div className="sentiment-root min-h-screen">{children}</div>;
}
