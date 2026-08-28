import { MarketCard } from "@/components/MarketCard";
import { getAllSnapshots } from "@/lib/snapshot";

// 常に最新のデータを取りに行く (Provider 側でキャッシュする設計にする)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshots = await getAllSnapshots();
  const hasDemo = snapshots.some((s) => s.demo);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">MARKET SENTIMENT</h1>
        <p className="mt-1 text-sm text-muted">Retail vs Large Trader</p>
      </header>

      {hasDemo ? (
        <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          DEMO DATA — 表示中の数値はサンプルです。実データの接続状況は README を参照してください。
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {snapshots.map((snapshot) => (
          <MarketCard key={snapshot.market.slug} snapshot={snapshot} />
        ))}
      </div>

      <footer className="mt-10 space-y-2 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
        <p>
          「Whale」は分かりやすさのための呼び名です。実際に表示しているのは CFTC の建玉報告などから推定した
          <strong className="text-[#c6cede]"> Large Trader / Institutional proxy</strong> であり、
          世界中の大口のポジションを取得しているわけではありません。
        </p>
        <p>
          Retail Sentiment は提供元 (ブローカー) の顧客ポジションであり、市場全体の個人ポジションではありません。
          CFTC のデータは週次で公表されます。
        </p>
        <p>売買を推奨するものではありません。表示しているのは「どちら側に傾いているか」だけです。</p>
      </footer>
    </main>
  );
}
