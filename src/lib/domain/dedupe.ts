/**
 * リマインドの冪等キーを生成する。
 *
 * `reminders.dedupe_key` には UNIQUE 制約が張られており、
 * Cron が多重起動しても同一キーの INSERT は必ず1件しか成功しない。
 * これが「二重通知しない」ことの最終的な保証になる。
 *
 * サイクル識別子には firstUnrepliedAt（返信が来るまで動かない時刻）を使う。
 * 担当者が返信すると次の未返信サイクルでは別の値になるため、
 * キーが衝突して新しい通知が抑止されることはない。
 */

function cycleId(cycleStart: Date): string {
  return String(cycleStart.getTime())
}

export function routineDedupeKey(conversationId: string, cycleStart: Date, sequence: number): string {
  return `r:${conversationId}:${cycleId(cycleStart)}:${sequence}`
}

export function guardDedupeKey(conversationId: string, cycleStart: Date, sequence: number): string {
  return `g:${conversationId}:${cycleId(cycleStart)}:${sequence}`
}

/** エスカレーションは「1サイクルにつき1ルール1回だけ」発火する */
export function escalationDedupeKey(conversationId: string, cycleStart: Date, ruleId: string): string {
  return `e:${conversationId}:${cycleId(cycleStart)}:${ruleId}`
}

/** watchdog は同一サイクル内で1時間に1回までに制限する */
export function watchdogDedupeKey(conversationId: string, cycleStart: Date, now: Date): string {
  const hourBucket = Math.floor(now.getTime() / 3_600_000)
  return `w:${conversationId}:${cycleId(cycleStart)}:${hourBucket}`
}
