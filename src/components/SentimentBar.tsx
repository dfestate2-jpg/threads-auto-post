/** Retail の Long / Short 比率を 1 本のバーで表す */
export function SentimentBar({ longPercent }: { longPercent: number }) {
  const long = Math.min(100, Math.max(0, longPercent));
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-short/70" role="presentation">
      <div className="h-full bg-long" style={{ width: `${long}%` }} />
    </div>
  );
}
