/** 表示用のフォーマッタ。UI からロジックを持ち出さないための小さな関数群。 */

export function formatPrice(value: number, decimals: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** +3.2 / -1.5 のように符号を必ず付ける */
export function formatSigned(value: number, digits = 1, suffix = ""): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}${suffix}`;
}

/** 建玉枚数。1,000 単位はそのまま読めるようにカンマ区切りにする */
export function formatContracts(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

/** "42 sec ago" / "3 min ago" / "5 h ago" */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffSec = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} sec ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** 週次データ用。"Aug 28, 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
