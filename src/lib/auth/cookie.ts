/**
 * Cookie 名だけを持つモジュール。
 * middleware は Edge ランタイムで動くため node:crypto を含む session.ts を読めない。
 * 名前の定数をここに切り出して両方から参照する。
 */
export const SESSION_COOKIE = 'lur_session'
