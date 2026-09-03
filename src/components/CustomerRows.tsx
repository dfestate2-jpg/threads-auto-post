import { HandlingStatus } from '@prisma/client'
import Link from 'next/link'

import { StatusSelect } from './StatusSelect'
import { ElapsedBadge, formatDateTimeJa } from './ui'

export interface CustomerRow {
  customerId: string
  name: string
  lineUserId: string
  assigneeName: string | null
  lastInboundText: string | null
  lastInboundAt: Date | null
  /** 未返信でなければ null */
  elapsedMinutes: number | null
  reminderCount: number
  handlingStatus: HandlingStatus
  resolvedAt: Date | null
  /** 楽観ロック用。同時操作の上書きを防ぐ */
  version: number
}

/**
 * 未返信一覧の中身。
 *
 * 管理者はスマホとパソコンの両方から見るため、同じデータを2つの形で出す。
 * 狭い画面では**カード**。以前は横1100pxの表で、スマホでは横スクロールしないと
 * 顧客名すら読めなかった。広い画面では一覧性が要るので**表**のまま。
 *
 * どちらも「行全体がリンク」にしてある。顧客名の文字だけをタップさせると、
 * 指では狙いにくいうえ、押せることに気づきにくい。
 */
export function CustomerRows({ rows, timezone }: { rows: CustomerRow[]; timezone: string }) {
  if (rows.length === 0) {
    return <div className="card p-10 text-center text-slate-500">該当する顧客はいません</div>
  }

  return (
    <>
      {/* --- スマホ --- */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.customerId} className="card p-4">
            <Link href={`/customers/${r.customerId}`} className="block active:opacity-70">
              <div className="flex items-start justify-between gap-3">
                <span className="text-base font-bold leading-tight">{r.name}</span>
                <ElapsedBadge minutes={r.elapsedMinutes} size="lg" />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{r.lastInboundText ?? '—'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>
                  担当 {r.assigneeName ?? <span className="font-medium text-orange-600">未設定</span>}
                </span>
                <span>リマインド {r.reminderCount}回</span>
                <span>{formatDateTimeJa(r.lastInboundAt, timezone)}</span>
              </div>
            </Link>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <StatusSelect
                customerId={r.customerId}
                customerName={r.name}
                value={r.handlingStatus}
                version={r.version}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* --- パソコン --- */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
              <th className="px-4 py-3">顧客名</th>
              <th className="px-4 py-3">未返信経過</th>
              <th className="px-4 py-3">最終メッセージ</th>
              <th className="px-4 py-3">担当者</th>
              <th className="px-4 py-3">状況</th>
              <th className="px-4 py-3 text-right">受信</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customerId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {/* セルごとにリンクを敷いて、行のどこを押しても開けるようにする */}
                <td className="p-0">
                  <Link href={`/customers/${r.customerId}`} className="block px-4 py-3 font-medium">
                    {r.name}
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={`/customers/${r.customerId}`} className="block px-4 py-3">
                    <ElapsedBadge minutes={r.elapsedMinutes} />
                  </Link>
                </td>
                <td className="max-w-[24rem] p-0">
                  <Link
                    href={`/customers/${r.customerId}`}
                    className="block truncate px-4 py-3 text-slate-600"
                    title={r.lastInboundText ?? ''}
                  >
                    {r.lastInboundText ?? '—'}
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={`/customers/${r.customerId}`} className="block px-4 py-3">
                    {r.assigneeName ?? <span className="font-medium text-orange-600">未設定</span>}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusSelect
                      customerId={r.customerId}
                      customerName={r.name}
                      value={r.handlingStatus}
                      version={r.version}
                    />
                    {r.reminderCount > 0 ? (
                      <span className="whitespace-nowrap text-xs text-slate-500">{r.reminderCount}回</span>
                    ) : null}
                  </div>
                </td>
                <td className="p-0 text-right">
                  <Link href={`/customers/${r.customerId}`} className="block px-4 py-3 text-xs text-slate-500">
                    {formatDateTimeJa(r.lastInboundAt, timezone)}
                    {r.resolvedAt ? (
                      <span className="block text-[11px] text-green-700">
                        済 {formatDateTimeJa(r.resolvedAt, timezone)}
                      </span>
                    ) : null}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
