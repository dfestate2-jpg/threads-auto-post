/**
 * 社内通知先としてLINEグループを使う場合の、グループID案内。
 *
 * グループIDは `C` から始まる33文字で、画面のどこにも表示されない。
 * Botを招待したときに本人へ返信して伝えるのが、確実で唯一現実的な手段になる。
 */

/** 招待時に伝えきれなかった場合に、あとから聞き直すための合言葉 */
const ID_REQUEST_PATTERN = /通知先ID|グループID|つうちさきID/i

/** 「このグループのIDを教えて」という趣旨の発言かどうか */
export function isGroupIdRequest(text: string | null | undefined): boolean {
  if (!text) return false
  return ID_REQUEST_PATTERN.test(text)
}

/** Botが招待されたときの案内文 */
export function groupWelcomeMessage(groupTarget: string): string {
  return [
    '社内通知Botです。このトークを未返信リマインドの通知先にできます。',
    '',
    '▼ 通知先ID',
    groupTarget,
    '',
    '管理画面の「設定 → 通知チャネル」で、',
    '種類「LINEグループ」・用途「社内共通」として登録してください。',
    '',
    '※ あとで確認したいときは、このトークで「通知先ID」と送ってください。',
  ].join('\n')
}

/** あとから聞き直されたときの応答 */
export function groupIdMessage(groupTarget: string): string {
  return ['▼ 通知先ID', groupTarget].join('\n')
}
