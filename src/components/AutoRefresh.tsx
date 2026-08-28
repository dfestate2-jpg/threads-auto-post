"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 一定間隔でサーバーコンポーネントを再取得する。
 * Retail は 20 分ごとの更新なので、ページを開きっぱなしでも
 * 古い数字が残り続けないようにするための最小限の仕組み。
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
