import { formatDate, formatRelative } from "@/lib/format";
import { RelativeTime } from "@/components/RelativeTime";
import type { DataMeta } from "@/providers/types";

/**
 * データの出所と鮮度。週次データ (CFTC) は日付表示にして、
 * リアルタイムだと誤解させない。
 */
export function SourceNote({ meta, label }: { meta: DataMeta; label?: string }) {
  const weekly = meta.cadence === "weekly" || meta.cadence === "daily";
  return (
    <p className="text-[11px] leading-relaxed text-muted">
      <span>Source: {label ?? meta.source}</span>
      {meta.demo ? <span className="ml-1 font-semibold text-warn">DEMO DATA</span> : null}
      <span className="mx-1.5 text-line">|</span>
      <span>
        Updated:{" "}
        {weekly ? (
          formatDate(meta.updatedAt)
        ) : (
          <RelativeTime iso={meta.updatedAt} fallback={formatRelative(meta.updatedAt, new Date(meta.updatedAt))} />
        )}
      </span>
      {meta.cadence === "weekly" ? <span className="ml-1">(weekly)</span> : null}
    </p>
  );
}
