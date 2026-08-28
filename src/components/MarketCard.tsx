import Link from "next/link";
import { BiasValue } from "@/components/BiasValue";
import { SentimentBar } from "@/components/SentimentBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatPrice, formatRelative } from "@/lib/format";
import { RelativeTime } from "@/components/RelativeTime";
import { formatDate } from "@/lib/format";
import type { MarketSnapshot } from "@/lib/snapshot";

/**
 * TOP ページのカード。
 * 出すのは Retail / Large Trader / Status / 最終更新だけ。ここに情報を足さない。
 */
export function MarketCard({ snapshot }: { snapshot: MarketSnapshot }) {
  const { market, retail, large, price, alignment } = snapshot;

  return (
    <Link
      href={`/market/${market.slug}`}
      className="flex h-full flex-col rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{market.symbol}</h2>
          <p className="text-xs text-muted">{market.nameJa}</p>
        </div>
        {price ? (
          <p className="font-num text-sm text-muted">{formatPrice(price.price, market.priceDecimals)}</p>
        ) : null}
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold tracking-widest text-muted">👥 RETAIL</p>
        {retail ? (
          <>
            <div className="mt-1.5 flex items-baseline justify-between font-num">
              <span className="text-long">
                <span className="text-2xl font-bold">{retail.longPercent}%</span>
                <span className="ml-1 text-[11px] tracking-widest">LONG</span>
              </span>
              <span className="text-short">
                <span className="text-[11px] tracking-widest">SHORT</span>
                <span className="ml-1 text-2xl font-bold">{retail.shortPercent}%</span>
              </span>
            </div>
            <div className="mt-2">
              <SentimentBar longPercent={retail.longPercent} />
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-info">DATA UNAVAILABLE</p>
        )}
      </div>

      <div className="mb-4 mt-4">
        <p className="text-[11px] font-semibold tracking-widest text-muted">🐋 LARGE TRADER BIAS</p>
        {large && alignment.largeBias ? (
          <div className="mt-1">
            <BiasValue bias={alignment.largeBias} momentum={alignment.largeMomentum} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-info">DATA UNAVAILABLE</p>
        )}
      </div>

      <div className="mt-auto border-t border-line pt-3">
        <StatusBadge status={alignment.status} />
        <p className="mt-2 text-[11px] text-muted">
          {retail ? (
            <>
              Retail{" "}
              <RelativeTime
                iso={retail.meta.updatedAt}
                fallback={formatRelative(retail.meta.updatedAt, new Date(retail.meta.updatedAt))}
              />
            </>
          ) : (
            "Retail —"
          )}
          <span className="mx-1.5 text-line">|</span>
          {large ? <>Large {formatDate(large.meta.updatedAt)}</> : "Large —"}
        </p>
      </div>
    </Link>
  );
}
