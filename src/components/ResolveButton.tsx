"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** 取り消せる猶予。押し間違いに気づくには十分で、待たされたと感じない長さ */
const UNDO_WINDOW_MS = 6000;

/**
 * 一覧から1タップで「対応済み」にするボタン。
 *
 * プルダウンから選ぶ形は、スマホだと「タップ→ホイールを回す→完了→確認」で4操作になる。
 * 一覧でいちばん多い操作がこれなので、ここだけ専用のボタンに切り出す。
 * 他の状況（未対応・対応中・要確認）への変更はプルダウンのまま。
 *
 * **確認ダイアログは出さない。** 毎回出るダイアログは反射的に押されるようになり、
 * 誤操作を止める力を失う。代わりに顧客名を見せて**数秒間取り消せる**ようにする。
 *
 * 取り消しは「送ってから戻す」ではなく **「猶予のあいだ送らない」**。
 * 対応済みへの遷移は追客側のステータスや履歴まで動かすため、
 * 一度送ってしまうと正確に巻き戻す手立てがない。送る前に止めれば、戻すものが生まれない。
 *
 * 猶予中にページを離れた場合はその場で確定させる。押した本人の意図は
 * 「対応済みにする」であって、黙って無かったことにするのは裏切りになる。
 */
export function ResolveButton({
  customerId,
  customerName,
  version,
}: {
  customerId: string;
  customerName: string;
  /** 楽観ロック用。同時操作の上書きを防ぐ */
  version: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "undoable" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 「まだ送っていない確定待ち」があるか。再描画に左右されない場所に持つ */
  const pendingRef = useRef(false);

  const commit = useCallback(async (): Promise<void> => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("saving");
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handlingStatus: "DONE", version }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setPhase("idle");
        setError(
          res.status === 409
            ? "他の人が更新しました。再読み込みしてください"
            : (body?.error ?? "更新できませんでした"),
        );
        return;
      }
      router.refresh();
    } catch {
      setPhase("idle");
      setError("通信に失敗しました");
    }
  }, [customerId, router, version]);

  /**
   * 確定処理を ref 越しに呼ぶ。
   * 依存配列に commit を入れると、他の行の操作による再描画（version の更新）で
   * 後片付けが走り、**猶予中なのに勝手に確定してしまう。**
   */
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(
    () => () => {
      if (pendingRef.current) void commitRef.current();
    },
    [],
  );

  function start(): void {
    setError(null);
    pendingRef.current = true;
    setPhase("undoable");
    timerRef.current = setTimeout(
      () => void commitRef.current(),
      UNDO_WINDOW_MS,
    );
  }

  function undo(): void {
    pendingRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("idle");
  }

  if (phase === "undoable") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="whitespace-nowrap font-medium text-green-800">
          ✅ {customerName} 様を対応済みに
        </span>
        <button
          type="button"
          className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
          onClick={(e) => {
            e.stopPropagation();
            undo();
          }}
        >
          元に戻す
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="whitespace-nowrap rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
        disabled={phase === "saving"}
        aria-label={`${customerName} 様を対応済みにする`}
        // 行全体がリンクなので、ボタンの操作でページ遷移させない
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          start();
        }}
      >
        {phase === "saving" ? "…" : "✅ 済"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
