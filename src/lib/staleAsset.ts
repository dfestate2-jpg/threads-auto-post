/**
 * 「再読み込みすれば直る」種類のエラーを見分けて、人に見せる前に回復させる。
 *
 * タブを開いたままデプロイすると、画面が入れ替わって消えたJSやRSCを取りに行き、
 * 404 やネットワークエラーになる。原因は古いタブを持っていることだけなので、
 * 再読み込みすれば必ず直る。業務中の人に英語のエラーを読ませる意味がない。
 *
 * error.tsx と global-error.tsx の両方から使う。以前は各ファイルに同じ判定を
 * 書き写していて、片方だけ直すと挙動がずれた。
 */

/**
 * 文言はブラウザごとに違うので広めに拾う。
 * Safari は読み込み失敗を素っ気なく `Load failed` としか言わないため、
 * これを入れないと Safari では自動回復がまったく効かない。
 */
export function isStaleAssetError(error: { name?: string; message?: string }): boolean {
  const text = `${error.name ?? ''} ${error.message ?? ''}`
  return /chunk|dynamically imported module|module script failed|importing a module|load failed|failed to fetch|networkerror/i.test(
    text,
  )
}

const RELOAD_KEY = 'stale-asset-reloads'
/** この時間だけ遡って回数を数える */
const WINDOW_MS = 5 * 60 * 1000
/** 同じ窓の中で自動リロードしてよい上限 */
const MAX_RELOADS = 2

interface ReloadMark {
  /** 直近の窓の中で自動リロードした回数 */
  n: number
  /** 窓の起点（最初の自動リロード時刻） */
  t: number
}

function read(): ReloadMark | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const { n, t } = parsed as Partial<ReloadMark>
    if (typeof n !== 'number' || typeof t !== 'number') return null
    return { n, t }
  } catch {
    return null
  }
}

/**
 * 自動リロードしてよいかを判定し、してよいなら回数を記録する。
 *
 * **単純な「1回だけ」フラグにしてはいけない。** それだと一度フラグが立った
 * タブは、次のデプロイで再びチャンクエラーになっても自動回復しなくなる。
 * 開きっぱなしのタブほど古くなりやすいので、いちばん助けたい相手を見捨てる。
 *
 * かといって無制限に許すと、本当に壊れている画面が無限リロードで
 * 操作不能になる。そこで「一定時間内に最大2回まで」に落ち着かせる。
 * 時間が経てば窓が切れて、また自動回復できるようになる。
 *
 * sessionStorage が使えない環境（プライベートブラウズ等）では自動リロードしない。
 * 回数を数えられない以上、無限リロードの危険を冒せない。
 */
export function claimAutoReload(now: number = Date.now()): boolean {
  let mark: ReloadMark | null
  try {
    mark = read()
  } catch {
    return false
  }

  const fresh = mark !== null && now - mark.t < WINDOW_MS
  const next: ReloadMark = fresh && mark !== null ? { n: mark.n + 1, t: mark.t } : { n: 1, t: now }
  if (next.n > MAX_RELOADS) return false

  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify(next))
  } catch {
    return false
  }
  return true
}
