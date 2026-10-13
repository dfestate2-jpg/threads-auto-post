import { isPaused } from '@/lib/domain/pauseDuration'

interface PauseSettings {
  remindersPausedUntil: Date | null
  remindersPauseIndefinite: boolean
  timezone: string
}

/**
 * 停止中であることを知らせる画面上部の警告文。null = 停止していない。
 *
 * **止めていることを忘れるのが、この機能で一番怖い失敗。**
 * 定期実行が止まったのと同じ結果（誰にも通知が届かない）になるので、
 * 未返信を見る画面すべてで同じ文言を最上部に出す。
 *
 * 期限なしの停止は自動で戻らないため、**何をすれば戻るかまで書く。**
 * 「止まっている」と伝えるだけでは、見た人が動けない。
 */
export function buildPauseAlert(settings: PauseSettings, now: Date): string | null {
  if (!isPaused({ until: settings.remindersPausedUntil, indefinite: settings.remindersPauseIndefinite }, now)) {
    return null
  }

  if (settings.remindersPauseIndefinite) {
    return '⏸ リマインドを停止中です（期限なし）。未返信があっても誰にも通知されません。設定画面の「▶ 今すぐ再開」を押すまで戻りません。'
  }

  const until = new Intl.DateTimeFormat('ja-JP', {
    timeZone: settings.timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(settings.remindersPausedUntil as Date)
  return `⏸ リマインドを一時停止中です（${until} まで）。この間、未返信があっても通知されません。`
}
