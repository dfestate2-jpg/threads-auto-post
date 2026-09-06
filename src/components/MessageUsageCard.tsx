import type { MonthlyUsage } from "@/lib/services/messageUsage";

/**
 * 今月のLINE消費通数。
 *
 * ライトプランは無料通数を超えると **送信そのものができなくなる**（追加購入不可）。
 * つまり枯渇＝リマインドの停止であり、このシステムの目的が丸ごと止まる。
 * 「使った量」だけを出しても手遅れになってから気づくので、
 * **月末見込みと、このペースなら何日に止まるか**まで出す。
 */
export function MessageUsageCard({ usage }: { usage: MonthlyUsage }) {
  const ratio = usage.quota > 0 ? Math.min(1, usage.used / usage.quota) : 0;
  const willExhaust =
    usage.exhaustionDay !== null && usage.exhaustionDay <= usage.daysInMonth;
  const tone =
    usage.used >= usage.quota ? "danger" : willExhaust ? "warn" : "ok";

  const barColor =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warn"
        ? "bg-orange-400"
        : "bg-green-500";

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">今月のLINE通数</h2>
        <span className="text-xs text-slate-500">
          {usage.dayOfMonth}日／{usage.daysInMonth}日
        </span>
      </div>

      <p className="mt-2">
        <span className="text-2xl font-bold tabular-nums">
          {usage.used.toLocaleString()}
        </span>
        <span className="text-sm text-slate-500">
          {" "}
          / {usage.quota.toLocaleString()} 通
        </span>
      </p>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full ${barColor}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-slate-700">
        月末見込み{" "}
        <strong className="tabular-nums">
          {usage.projected.toLocaleString()}
        </strong>{" "}
        通
      </p>

      {usage.used >= usage.quota ? (
        <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          🚨 無料通数を使い切りました。ライトプランでは追加送信ができないため、
          <strong>リマインドが届いていない可能性があります。</strong>
        </p>
      ) : willExhaust ? (
        <p className="mt-2 rounded bg-orange-50 px-3 py-2 text-sm text-orange-900">
          ⚠️ このペースだと <strong>{usage.exhaustionDay}日ごろ</strong>{" "}
          に上限へ達します。 超えると送信できなくなり、リマインドが止まります。
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          このペースなら今月は上限に届きません。
        </p>
      )}

      {usage.byPurpose.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {usage.byPurpose.map((b) => (
            <li
              key={b.purpose}
              className="flex items-center justify-between text-xs text-slate-600"
            >
              <span>{b.label}</span>
              <span className="tabular-nums">
                {b.units.toLocaleString()} 通
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          今月の送信記録はまだありません。
        </p>
      )}

      {usage.hasUnknownGroupSize ? (
        <p className="mt-3 text-xs text-orange-700">
          ⚠️
          人数が未登録のLINEグループがあります。グループ宛ては人数分カウントされるため、
          <strong>実際の消費はこの数より多くなります。</strong>設定 →
          通知チャネルで人数を入れてください。
        </p>
      ) : null}
    </section>
  );
}
