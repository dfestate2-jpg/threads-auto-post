import { NextResponse } from "next/server";
import { dataMode } from "@/providers/registry";
import { getAllSnapshots } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

/** TOP ページと同じ内容を JSON で返す (履歴は含めない) */
export async function GET() {
  const snapshots = await getAllSnapshots();

  return NextResponse.json({
    mode: dataMode(),
    markets: snapshots.map((s) => ({
      symbol: s.market.symbol,
      slug: s.market.slug,
      nameJa: s.market.nameJa,
      retail: s.retail
        ? {
            label: s.retailLabel,
            longPercent: s.retail.longPercent,
            shortPercent: s.retail.shortPercent,
            change1h: s.retail.change1h,
            change24h: s.retail.change24h,
            source: s.retail.meta.source,
            updatedAt: s.retail.meta.updatedAt,
            demo: s.retail.meta.demo,
          }
        : null,
      retailReason: s.retailReason,
      largeTrader: s.large
        ? {
            bias: s.alignment.largeBias,
            momentum: s.alignment.largeMomentum,
            netPosition: s.large.netPosition,
            previousNetPosition: s.large.previousNetPosition,
            traderCategory: s.large.traderCategory,
            source: s.large.meta.source,
            updatedAt: s.large.meta.updatedAt,
            cadence: s.large.meta.cadence,
            demo: s.large.meta.demo,
          }
        : null,
      largeTraderReason: s.largeReason,
      price: s.price ? { value: s.price.price, change24hPercent: s.price.change24hPercent } : null,
      status: s.alignment.status,
      alignmentScore: s.alignment.score,
    })),
  });
}
