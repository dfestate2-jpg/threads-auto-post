"use client";

import { HandlingStatus } from "@prisma/client";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AssigneeSelect } from "./AssigneeSelect";
import { BulkResolveBar } from "./BulkResolveBar";
import { InProgressBadge } from "./InProgressBadge";
import { ResolveButton } from "./ResolveButton";
import { StatusSelect } from "./StatusSelect";
import { ElapsedBadge, formatDateTimeJa } from "./ui";

export interface CustomerRow {
  customerId: string;
  name: string;
  /** LINE未連携の顧客（電話・ポータル経由の反響）は null になる */
  lineUserId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  lastInboundText: string | null;
  lastInboundAt: Date | null;
  /** 未返信でなければ null */
  elapsedMinutes: number | null;
  reminderCount: number;
  handlingStatus: HandlingStatus;
  resolvedAt: Date | null;
  /** 「対応中」で鳴らさない期限。過去・null なら監視中 */
  inProgressUntil: Date | null;
  /** 楽観ロック用。同時操作の上書きを防ぐ */
  version: number;
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
export function CustomerRows({
  rows,
  staff,
  timezone,
  /**
   * まとめて対応済みにする操作を出すか。
   * 未返信一覧では出すが、ダッシュボードの抜粋（ワースト10）では出さない。
   * 全体を見ていない場所で一括操作をさせると、選び漏れに気づけない
   */
  bulkResolve = false,
  /** 絞り込み条件に当てはまる全件数。ページをまたいだ合計 */
  total,
  /** 確認文に出す絞り込みの説明 */
  filterDescription,
}: {
  rows: CustomerRow[];
  /** 担当者プルダウンの選択肢 */
  staff: { id: string; name: string }[];
  timezone: string;
  bulkResolve?: boolean;
  total?: number;
  filterDescription?: string;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** 対応済みの行は選べない。押しても何も起きない操作を見せない */
  const selectable = useMemo(
    () => rows.filter((r) => r.handlingStatus !== HandlingStatus.DONE),
    [rows],
  );

  /**
   * 選択は「いま画面にある行」に限る。
   * ページを移ると前のページの選択は消える。見えていないものを
   * まとめて閉じられると、何を閉じたのか本人にも分からなくなる
   */
  const selected = useMemo(
    () =>
      selectable
        .filter((r) => selectedIds.has(r.customerId))
        .map((r) => ({ customerId: r.customerId, version: r.version })),
    [selectable, selectedIds],
  );

  const toggle = (customerId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  const allSelected =
    selectable.length > 0 && selectable.every((r) => selectedIds.has(r.customerId));

  const toggleAll = (): void => {
    setSelectedIds(allSelected ? new Set() : new Set(selectable.map((r) => r.customerId)));
  };

  if (rows.length === 0) {
    return (
      <div className="card p-10 text-center text-slate-500">
        該当する顧客はいません
      </div>
    );
  }

  const checkbox = (r: CustomerRow) =>
    bulkResolve && r.handlingStatus !== HandlingStatus.DONE ? (
      <input
        type="checkbox"
        className="h-5 w-5 shrink-0 accent-slate-900"
        checked={selectedIds.has(r.customerId)}
        aria-label={`${r.name} を選択`}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggle(r.customerId)}
      />
    ) : null;

  return (
    <>
      {/* --- スマホ --- */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.customerId} className="card p-4">
            <div className="flex items-start gap-3">
              {checkbox(r)}
              <Link
                href={`/customers/${r.customerId}`}
                className="block flex-1 active:opacity-70"
              >
              <div className="flex items-start justify-between gap-3">
                <span className="text-base font-bold leading-tight">
                  {r.name}
                </span>
                <ElapsedBadge minutes={r.elapsedMinutes} size="lg" />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                {r.lastInboundText ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>リマインド {r.reminderCount}回</span>
                <span>{formatDateTimeJa(r.lastInboundAt, timezone)}</span>
              </div>
              </Link>
            </div>
            {/* 担当は上のリンク内に文字で出さない。同じ情報が2か所にあると、
                どちらを直せばよいのか分からなくなる */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {r.inProgressUntil && r.inProgressUntil.getTime() > Date.now() ? (
                <InProgressBadge
                  customerId={r.customerId}
                  customerName={r.name}
                  until={r.inProgressUntil}
                  timezone={timezone}
                  version={r.version}
                />
              ) : null}
              {r.handlingStatus === "DONE" ? null : (
                <ResolveButton
                  customerId={r.customerId}
                  customerName={r.name}
                  version={r.version}
                />
              )}
              <StatusSelect
                customerId={r.customerId}
                customerName={r.name}
                value={r.handlingStatus}
                version={r.version}
              />
              <AssigneeSelect
                customerId={r.customerId}
                customerName={r.name}
                value={r.assigneeId}
                valueName={r.assigneeName}
                staff={staff}
                version={r.version}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* --- パソコン --- */}
      {/*
        担当者・状況のプルダウンが入って表が広くなったため、幅の狭い場所
        （ダッシュボードのワースト10は3分割の2列分しかない）では収まらない。
        列を潰して顧客名が1文字ずつ折り返されるより、表だけ横スクロールさせる。
        ページ全体が横に伸びないよう、スクロールはこの枠の中に閉じ込める。
      */}
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
                {bulkResolve ? (
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-slate-900"
                      checked={allSelected}
                      aria-label="表示中をすべて選択"
                      onChange={toggleAll}
                      title="表示中をすべて選択"
                    />
                  </th>
                ) : null}
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
                <tr
                  key={r.customerId}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  {bulkResolve ? <td className="px-4 py-3">{checkbox(r)}</td> : null}
                  {/* セルごとにリンクを敷いて、行のどこを押しても開けるようにする */}
                  <td className="p-0">
                    <Link
                      href={`/customers/${r.customerId}`}
                      className="block whitespace-nowrap px-4 py-3 font-medium"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/customers/${r.customerId}`}
                      className="block px-4 py-3"
                    >
                      <ElapsedBadge minutes={r.elapsedMinutes} />
                    </Link>
                  </td>
                  <td className="max-w-[20rem] p-0">
                    <Link
                      href={`/customers/${r.customerId}`}
                      className="block truncate px-4 py-3 text-slate-600"
                      title={r.lastInboundText ?? ""}
                    >
                      {r.lastInboundText ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AssigneeSelect
                      customerId={r.customerId}
                      customerName={r.name}
                      value={r.assigneeId}
                      valueName={r.assigneeName}
                      staff={staff}
                      version={r.version}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/*
                        一覧でいちばん多い操作が「対応済みにする」なので、
                        プルダウンを開かせず1タップで済ませる。
                        既に対応済みの行には出さない（押す意味がない）
                      */}
                      {r.handlingStatus === "DONE" ? null : (
                        <ResolveButton
                          customerId={r.customerId}
                          customerName={r.name}
                          version={r.version}
                        />
                      )}
                      <StatusSelect
                        customerId={r.customerId}
                        customerName={r.name}
                        value={r.handlingStatus}
                        version={r.version}
                      />
                      {r.reminderCount > 0 ? (
                        <span className="whitespace-nowrap text-xs text-slate-500">
                          {r.reminderCount}回
                        </span>
                      ) : null}
                      {r.inProgressUntil && r.inProgressUntil.getTime() > Date.now() ? (
                        <InProgressBadge
                          customerId={r.customerId}
                          customerName={r.name}
                          until={r.inProgressUntil}
                          timezone={timezone}
                          version={r.version}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="p-0 text-right">
                    <Link
                      href={`/customers/${r.customerId}`}
                      className="block px-4 py-3 text-xs text-slate-500"
                    >
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
      </div>

      {/* 画面下に貼り付けて、長い一覧でもスクロールせずに押せるようにする */}
      {bulkResolve ? (
        <BulkResolveBar
          selected={selected}
          total={total ?? rows.length}
          filterDescription={filterDescription ?? 'すべて'}
          onDone={() => setSelectedIds(new Set())}
          onClear={() => setSelectedIds(new Set())}
        />
      ) : null}
    </>
  );
}
