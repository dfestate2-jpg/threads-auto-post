"use client";

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/format";

/**
 * 「42 sec ago」表示。
 * サーバー描画時と時刻がずれてハイドレーションが壊れないよう、
 * マウント後に相対表示へ切り替える。
 */
export function RelativeTime({ iso, fallback }: { iso: string; fallback: string }) {
  const [text, setText] = useState(fallback);

  useEffect(() => {
    const update = () => setText(formatRelative(iso));
    update();
    const timer = setInterval(update, 15_000);
    return () => clearInterval(timer);
  }, [iso]);

  return <span suppressHydrationWarning>{text}</span>;
}
