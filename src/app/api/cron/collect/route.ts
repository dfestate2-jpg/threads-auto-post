/**
 * 定期取得のエンドポイント。20 分ごとに叩かれる想定。
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/collect
 *
 * CRON_SECRET が未設定なら動かさない (誰でも叩ける状態にしない)。
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { collectRetailHistory } from "@/lib/collect";

export const dynamic = "force-dynamic";

function tokenOf(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return null;
}

function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET が未設定のため定期取得を受け付けない" },
      { status: 503 },
    );
  }

  const provided = tokenOf(request);
  if (!provided || !matches(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await collectRetailHistory();
  return NextResponse.json(summary);
}
