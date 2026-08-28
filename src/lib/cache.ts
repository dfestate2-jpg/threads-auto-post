/**
 * Provider の取得結果をプロセス内に短時間だけ持つキャッシュ。
 *
 * ページを開くたびに外部 API を叩かないための最小限の仕組み。
 * サーバーレスではインスタンスごとに独立し、再起動で消える。
 * 履歴を貯めるのはこの層の役目ではない (DB を接続する段階で分ける)。
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/**
 * ttlFor で結果ごとに保持時間を変えられる。
 * 取得失敗を長く握ると復旧しても古い失敗を返し続けるため、
 * 呼び出し側で失敗時だけ短い TTL を指定する。
 */
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  ttlFor: (value: T) => number,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const value = await load();
  store.set(key, { value, expiresAt: now + ttlFor(value) });
  return value;
}

/** 成功は長く、失敗は短く持つための ttlFor */
export function ttlByStatus(okTtlMs: number, failureTtlMs = 60_000) {
  return (value: { status: string }) => (value.status === "ok" ? okTtlMs : failureTtlMs);
}

/** テスト用 */
export function clearCache(): void {
  store.clear();
}
