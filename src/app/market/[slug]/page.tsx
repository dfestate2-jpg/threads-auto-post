import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BiasValue } from "@/components/BiasValue";
import { NetPositionChart } from "@/components/NetPositionChart";
import { SentimentBar } from "@/components/SentimentBar";
import { Sparkline } from "@/components/Sparkline";
import { SourceNote } from "@/components/SourceNote";
import { StatusBadge } from "@/components/StatusBadge";
import { formatContracts, formatDate, formatPrice, formatSigned } from "@/lib/format";
import { getSnapshotBySlug } from "@/lib/snapshot";
import type { MarketSnapshot } from "@/lib/snapshot";

// ビルド時に固定せず、アクセスごとに最新のデータを取りに行く
export const dynamic = "force-dynamic";

export default async function MarketDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getSnapshotBySlug(slug);
  if (!snapshot) notFound();

  const { market, retail, large, price, alignment } = snapshot;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <AutoRefresh />
      <Link href="/" className="text-xs text-muted hover:text-white">
        ← MARKET SENTIMENT
      </Link>

      {/* 画面上部: これだけで方向性が分かるサマリー */}
      <header className="mt-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{market.symbol}</h1>
            <p className="text-xs text-muted">{market.nameJa}</p>
          </div>
          {price ? (
            <div className="text-right">
              <p className="font-num text-2xl font-bold">{formatPrice(price.price, market.priceDecimals)}</p>
              {price.change24hPercent !== null ? (
                <p className={`font-num text-xs ${price.change24hPercent >= 0 ? "text-long" : "text-short"}`}>
                  {formatSigned(price.change24hPercent, 2, "%")} / 24h
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-info">PRICE UNAVAILABLE</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] tracking-widest text-muted">👥 RETAIL</p>
            {retail ? (
              <p className="font-num text-xl font-bold">
                <span className="text-long">LONG {retail.longPercent}%</span>
              </p>
            ) : (
              <p className="text-sm text-info">UNAVAILABLE</p>
            )}
          </div>
          <div>
            <p className="text-[11px] tracking-widest text-muted">🐋 LARGE TRADER</p>
            {alignment.largeBias ? (
              <BiasValue bias={alignment.largeBias} momentum={alignment.largeMomentum} />
            ) : (
              <p className="text-sm text-info">UNAVAILABLE</p>
            )}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[11px] tracking-widest text-muted">STATUS</p>
            <div className="mt-1">
              <StatusBadge status={alignment.status} />
            </div>
          </div>
        </div>
      </header>

      <RetailSection snapshot={snapshot} />
      <LargeTraderSection snapshot={snapshot} />
      <AlignmentSection snapshot={snapshot} />
      <PriceSection snapshot={snapshot} />

      <p className="mt-8 text-[11px] leading-relaxed text-muted">
        🐋 は Large Trader / Institutional proxy の推定です。CFTC の建玉報告は週次で、対象日から公表まで数日遅れます。
        Retail は提供元ブローカーの顧客ポジションであり、市場全体の個人ポジションではありません。
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-panel p-4">
      <h2 className="text-[11px] font-semibold tracking-widest text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Unavailable({ reason }: { reason: string | null }) {
  return (
    <div>
      <p className="text-lg font-semibold text-info">DATA UNAVAILABLE</p>
      {reason ? <p className="mt-1 text-[11px] text-muted">{reason}</p> : null}
    </div>
  );
}

function RetailSection({ snapshot }: { snapshot: MarketSnapshot }) {
  const { retail, retailLabel, retailReason } = snapshot;
  return (
    <Section title="👥 RETAIL">
      {retail ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] tracking-widest text-long">LONG</p>
              <p className="font-num text-5xl font-bold text-long">{retail.longPercent}%</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] tracking-widest text-short">SHORT</p>
              <p className="font-num text-3xl font-bold text-short">{retail.shortPercent}%</p>
            </div>
          </div>
          <div className="mt-3">
            <SentimentBar longPercent={retail.longPercent} />
          </div>

          <div className="mt-4 flex gap-6">
            <Change label="1h" value={retail.change1h} />
            <Change label="24h" value={retail.change24h} />
          </div>

          <div className="mt-4">
            <Sparkline points={retail.history} color="#2fbf71" baseline={50} />
            <p className="mt-1 text-[11px] text-muted">Long% の推移 (直近 48 時間 / 破線は 50%)</p>
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <SourceNote meta={retail.meta} label={retailLabel} />
          </div>
        </>
      ) : (
        <Unavailable reason={retailReason} />
      )}
    </Section>
  );
}

function Change({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-[11px] tracking-widest text-muted">{label}</p>
      {value === null ? (
        <p className="font-num text-lg text-muted">—</p>
      ) : (
        <p className={`font-num text-lg font-semibold ${value >= 0 ? "text-long" : "text-short"}`}>
          {formatSigned(value, 1, "%")}
        </p>
      )}
    </div>
  );
}

function LargeTraderSection({ snapshot }: { snapshot: MarketSnapshot }) {
  const { large, largeReason, alignment } = snapshot;
  return (
    <Section title="🐋 LARGE TRADER (INSTITUTIONAL PROXY)">
      {large && alignment.largeBias ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] tracking-widest text-muted">NET POSITION</p>
              <p
                className={`font-num text-4xl font-bold ${large.netPosition >= 0 ? "text-long" : "text-short"}`}
              >
                {formatContracts(large.netPosition)}
              </p>
              <p className="mt-1 text-[11px] text-muted">{large.traderCategory} / contracts</p>
            </div>
            <BiasValue bias={alignment.largeBias} momentum={alignment.largeMomentum} size="lg" />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="LONG" value={formatContracts(large.longPosition)} />
            <Stat label="SHORT" value={formatContracts(large.shortPosition)} />
            <Stat
              label="PREVIOUS WEEK"
              value={large.previousNetPosition === null ? "—" : formatContracts(large.previousNetPosition)}
            />
            <Stat
              label="CHANGE"
              value={
                alignment.largeNetChangePercent === null
                  ? "—"
                  : formatSigned(alignment.largeNetChangePercent, 1, "%")
              }
              tone={
                alignment.largeNetChangePercent === null
                  ? "muted"
                  : alignment.largeNetChangePercent >= 0
                    ? "long"
                    : "short"
              }
            />
          </dl>

          <div className="mt-4">
            <NetPositionChart points={large.history} />
            <p className="mt-1 text-[11px] text-muted">Net Position の推移 (週次 / 直近 26 週)</p>
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <SourceNote meta={large.meta} />
            <p className="mt-1 text-[11px] text-muted">
              対象週: {formatDate(large.history[large.history.length - 1]?.t ?? large.meta.updatedAt)}
            </p>
          </div>
        </>
      ) : (
        <Unavailable reason={largeReason} />
      )}
    </Section>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "long" | "short" | "muted" }) {
  const color =
    tone === "long" ? "text-long" : tone === "short" ? "text-short" : tone === "muted" ? "text-muted" : "";
  return (
    <div>
      <dt className="text-[11px] tracking-widest text-muted">{label}</dt>
      <dd className={`font-num text-lg font-semibold ${color}`}>{value}</dd>
    </div>
  );
}

function AlignmentSection({ snapshot }: { snapshot: MarketSnapshot }) {
  const { alignment } = snapshot;
  return (
    <Section title="MARKET ALIGNMENT">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Chain label="RETAIL" value={alignment.retailBias ?? "—"} />
        <Chain label="LARGE" value={alignment.largeBias ?? "—"} />
        <Chain label="PRICE" value={alignment.priceTrend ?? "—"} />
      </div>

      <p className="my-2 text-center text-muted" aria-hidden>
        ↓
      </p>

      <div className="flex flex-col items-center gap-3">
        <StatusBadge status={alignment.status} size="lg" />
        {alignment.score !== null ? (
          <div className="text-center">
            <p className="font-num text-4xl font-bold">{alignment.score}</p>
            <p className="text-[11px] tracking-widest text-muted">ALIGNMENT SCORE</p>
          </div>
        ) : null}
      </div>

      {alignment.score !== null ? (
        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          Alignment Score は「Retail と Large Trader がどれだけ同じ方向を向いているか」を 0-100 で表した指標です
          (100 に近いほど一致、0 に近いほど乖離)。売買シグナルではありません。
        </p>
      ) : (
        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          Retail と Large Trader の両方が揃わないと判定できないため、判定を出していません。
        </p>
      )}
    </Section>
  );
}

function Chain({ label, value }: { label: string; value: string }) {
  const color = value === "LONG" || value === "UP" ? "text-long" : value === "SHORT" || value === "DOWN" ? "text-short" : "text-muted";
  return (
    <div className="rounded-xl border border-line bg-black/20 px-2 py-3">
      <p className="text-[11px] tracking-widest text-muted">{label}</p>
      <p className={`font-num text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function PriceSection({ snapshot }: { snapshot: MarketSnapshot }) {
  const { price, priceReason } = snapshot;
  return (
    <Section title="PRICE">
      {price ? (
        <>
          <Sparkline points={price.history} color="#4a8fd4" />
          <p className="mt-1 text-[11px] text-muted">価格の推移 (直近 72 時間)</p>
          <div className="mt-3 border-t border-line pt-3">
            <SourceNote meta={price.meta} />
          </div>
        </>
      ) : (
        <Unavailable reason={priceReason} />
      )}
    </Section>
  );
}
