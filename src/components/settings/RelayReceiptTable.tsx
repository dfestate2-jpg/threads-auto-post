import { formatDateTimeJa } from '@/components/ui'

export interface RelayReceiptView {
  id: string
  receivedAt: Date
  endpoint: string
  accepted: boolean
  detail: string
  eventCount: number
  shape: string | null
}

const ENDPOINT_LABEL: Record<string, string> = {
  RELAY: 'Lステップ転送',
  WEBHOOK: 'LINE直接',
}

/** 拒否理由を、次にどこを直せばよいかが分かる日本語にする */
const DETAIL_LABEL: Record<string, string> = {
  NO_CREDENTIAL: '認証情報が付いていない（URLのtokenを確認）',
  BAD_TOKEN: 'トークンが一致しない（URLのtokenを確認）',
  BAD_SIGNATURE: '署名が一致しない（チャネルシークレットを確認）',
  NO_CHANNEL_SECRET: 'チャネルシークレットが未設定',
  LINE_SIGNATURE: 'LINE署名で受理',
  RELAY_TOKEN: '転送用トークンで受理',
  MAIN: '顧客対応チャネル',
  NOTIFY: '社内通知チャネル',
}

export function RelayReceiptTable({ rows, timezone }: { rows: RelayReceiptView[]; timezone: string }) {
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-bold">受信状況</h2>
      <p className="mb-3 text-xs text-slate-500">
        顧客メッセージの入口に届いたリクエストの記録です。ここが空のままなら、Lステップの転送設定か
        LINEのWebhook設定が効いていません。メッセージ本文は保存していません。
      </p>

      {rows.length === 0 ? (
        <div className="rounded border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          <p className="font-bold">まだ1件も受信していません。</p>
          <p className="mt-2 text-xs">
            確認する箇所：
            <br />① Lステップ → 設定 → アカウント設定 → 外部連携設定 の「LINE Webhook転送設定」にURLが保存されているか
            <br />② そのオプション（LINE Webhook転送）が有効になっているか
            <br />③ 保存したあとに顧客からメッセージが届いているか（保存前のものは転送されません）
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2">受信日時</th>
              <th>受け口</th>
              <th>結果</th>
              <th>内容</th>
              <th>件数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 text-xs text-slate-600">{formatDateTimeJa(r.receivedAt, timezone)}</td>
                <td className="text-xs">{ENDPOINT_LABEL[r.endpoint] ?? r.endpoint}</td>
                <td>
                  {r.accepted ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">受理</span>
                  ) : (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">拒否</span>
                  )}
                </td>
                <td className="text-xs text-slate-600">
                  {DETAIL_LABEL[r.detail] ?? r.detail}
                  {/*
                    受理したのに0件 = 転送の形式が想定と違う。放置すると未返信を丸ごと
                    取りこぼすので、その手がかり（構造だけ）をここに出す。
                  */}
                  {r.accepted && r.eventCount === 0 && r.shape ? (
                    <div className="mt-1 rounded bg-slate-100 p-1 font-mono text-[10px] text-slate-700">
                      形式が想定外です: {r.shape}
                    </div>
                  ) : null}
                </td>
                <td className="tabular-nums text-xs text-slate-600">{r.eventCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
