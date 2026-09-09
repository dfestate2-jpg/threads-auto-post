import { NextResponse } from "next/server";
import { dataMode } from "@/providers/registry";
import { getSnapshotBySlug } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

/** 詳細ページと同じ内容 (履歴込み) を JSON で返す */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getSnapshotBySlug(slug);

  if (!snapshot) {
    return NextResponse.json({ error: "market not found" }, { status: 404 });
  }

  return NextResponse.json({ mode: dataMode(), ...snapshot });
}
