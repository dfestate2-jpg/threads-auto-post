/**
 * 追客ボードの中核：角度から「次にいつ追うか」を決める。
 *
 * 副作用なし・データベースに触らない。ここだけ読めば追客の間隔が全部わかる、
 * という状態にしてある。営業感覚とズレたときに直す場所でもあるので、
 * 設定文字列の意味をここに全部書いておく。
 */
import { dateKeyOf, instantAtDayMinutes, shiftDateKey, startOfDayIn } from '@/lib/domain/time'

/** 角度は 1〜5 の整数。null は「まだ判断していない」 */
export type Angle = 1 | 2 | 3 | 4 | 5

export const ANGLES: Angle[] = [1, 2, 3, 4, 5]

export function isAngle(v: unknown): v is Angle {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

/** 角度の意味。営業に見せる文言と揃える */
export const ANGLE_LABEL: Record<Angle, string> = {
  5: 'うちで契約しそう',
  4: '有望',
  3: '迷っている',
  2: '薄い',
  1: '変な顧客／他社で契約しそう',
}

/**
 * 間隔の設定を読み解いた結果。
 *
 * `days` は「何日後に追うか」を、反応がないほど右へ進む形で並べたもの。
 * 使い切ったあとの振る舞いが `whenExhausted` で決まる。
 */
export interface Ladder {
  /** 追わない（off）なら空 */
  days: number[]
  /** repeat = 最後の数字を繰り返す / end = そこで追客を打ち切る */
  whenExhausted: 'repeat' | 'end'
  /** 追わない設定かどうか */
  off: boolean
}

export const LADDER_OFF: Ladder = { days: [], whenExhausted: 'end', off: true }

/**
 * 設定文字列を読み解く。
 *
 * - `"3,5,7"`     → 3日後、反応がなければ5日後、以降は7日おき
 * - `"14,30,end"` → 14日後、30日後、それでも反応がなければ追客を終える
 * - `"off"`       → 追わない
 *
 * 壊れた文字列で追客が止まると事故なので、読めなければ `fallback` に倒す。
 * 例外は投げない。
 */
export function parseLadder(raw: string | null | undefined, fallback: Ladder = LADDER_OFF): Ladder {
  const text = (raw ?? '').trim().toLowerCase()
  if (text === '' ) return fallback
  if (text === 'off') return LADDER_OFF

  const parts = text.split(',').map((p) => p.trim()).filter((p) => p !== '')
  if (parts.length === 0) return fallback

  const whenExhausted = parts[parts.length - 1] === 'end' ? 'end' : 'repeat'
  const numeric = (whenExhausted === 'end' ? parts.slice(0, -1) : parts).map((p) => Number(p))

  // 1つでも数字でない・0以下があれば、設定ミスとみなして既定に倒す
  if (numeric.length === 0 || numeric.some((n) => !Number.isFinite(n) || !Number.isInteger(n) || n < 1)) {
    return fallback
  }
  return { days: numeric, whenExhausted, off: false }
}

/** 設定画面に出すために文字列へ戻す */
export function formatLadder(ladder: Ladder): string {
  if (ladder.off) return 'off'
  return ladder.whenExhausted === 'end' ? [...ladder.days, 'end'].join(',') : ladder.days.join(',')
}

/**
 * 何日後に追うか。
 *
 * `streak` は「反応がないまま繰り返した回数」で、0 が初回。
 * 使い切ったあとは、repeat なら最後の数字、end なら null（＝打ち切り）。
 */
export function daysForStreak(ladder: Ladder, streak: number): number | null {
  if (ladder.off || ladder.days.length === 0) return null
  const i = Math.max(0, Math.trunc(streak))
  const within = ladder.days[i]
  if (within !== undefined) return within
  if (ladder.whenExhausted !== 'repeat') return null
  return ladder.days[ladder.days.length - 1] ?? null
}

/** 角度ごとの間隔設定 */
export type LadderTable = Record<Angle, Ladder>

/** 通知をいつ出すか（Asia/Tokyo の時・分） */
export interface NotifyTime {
  hour: number
  minute: number
}

export interface NextDueInput {
  angle: Angle
  /** 反応がないまま繰り返した回数。0 が初回 */
  streak: number
  /** 数え始める時刻（ふつうは「今」） */
  from: Date
  table: LadderTable
  timezone: string
  notify: NotifyTime
}

export interface NextDue {
  /** 次に通知する時刻。null なら追客しない・打ち切り */
  at: Date | null
  /** 打ち切りなら true（角度は付いているが、もう追わない） */
  exhausted: boolean
  /** 何日後か。表示用 */
  days: number | null
}

/**
 * 次回追客の時刻を出す。
 *
 * 「n日後の朝9時」を Asia/Tokyo で数える。営業が見るのは日本時間なので、
 * サーバーがどこで動いていても同じ日付になる必要がある。
 */
export function nextDue(input: NextDueInput): NextDue {
  const ladder = input.table[input.angle]
  const days = daysForStreak(ladder, input.streak)
  if (days === null) {
    // off（角度1など）と、end で使い切った場合の両方がここに来る。
    // 呼び出し側が区別できるよう exhausted で分ける
    return { at: null, exhausted: !ladder.off, days: null }
  }

  // ミリ秒を足すのではなく日付キーで数える。夏時間や実行環境のタイムゾーンに
  // 左右されず、日本時間で必ず「n日後の指定時刻」になる
  const targetKey = shiftDateKey(dateKeyOf(input.from, input.timezone), days)
  const at = instantAtDayMinutes(targetKey, input.notify.hour * 60 + input.notify.minute, input.timezone)
  return { at, exhausted: false, days }
}

/**
 * 期限を何日過ぎているか。過ぎていなければ 0。
 * 「3日超過」のように画面へ出すためのもの。
 */
export function overdueDays(dueAt: Date, now: Date, timezone: string): number {
  const due = startOfDayIn(timezone, dueAt).getTime()
  const today = startOfDayIn(timezone, now).getTime()
  // 起点をどちらも「その日の0時」に揃えてから割るので、時刻のズレでは1日ずれない
  return Math.max(0, Math.round((today - due) / 86_400_000))
}

/**
 * 今日やることに出すかどうか。
 *
 * 期限が来ている（今日ぶんと、過ぎたぶん）だけを出す。
 * 未来のものを混ぜると「今日やること」が今日のことでなくなる。
 */
export function isDueToday(dueAt: Date | null, now: Date, timezone: string): boolean {
  if (!dueAt) return false
  const endOfToday = instantAtDayMinutes(dateKeyOf(now, timezone), 1440, timezone).getTime()
  return dueAt.getTime() < endOfToday
}

/**
 * 今日やることの並び順。
 *
 * 期限を過ぎたものが上、次に角度の高いもの、同じなら古いもの。
 * 「一番放置されていて、一番熱い人」が一番上に来る。
 */
export function todayOrder(a: { dueAt: Date | null; angle: number | null }, b: { dueAt: Date | null; angle: number | null }): number {
  const at = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER
  const bt = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER
  if (at !== bt) return at - bt
  return (b.angle ?? 0) - (a.angle ?? 0)
}

/**
 * 設定画面に入力された文字列が読めるかどうか。
 *
 * 保存できてしまってから既定値に倒れると、変えたつもりで変わっていない
 * 状態になる。入口で弾いて、その場で直してもらう。
 */
export function isValidLadderInput(raw: string): boolean {
  const sentinel: Ladder = { days: [], whenExhausted: 'repeat', off: false }
  return parseLadder(raw, sentinel) !== sentinel
}
