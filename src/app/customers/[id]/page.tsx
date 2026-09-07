import { Direction, ReplyState } from '@prisma/client'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { FollowUpActions } from '@/components/followup/FollowUpActions'
import { CustomerInfoPanel } from '@/components/followup/CustomerInfoPanel'
import {
  ActionBadge,
  CustomerStatusBadge,
  ElapsedBadge,
  PriorityBadge,
  StatusBadge,
  formatDateTimeJa,
  formatYen,
} from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { ACTION_TYPE_LABEL, CUSTOMER_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/domain/followUp'
import { pickTemplates, renderTemplate } from '@/lib/domain/messageTemplate'
import { diffMinutes } from '@/lib/domain/time'
import { prisma, withReadRetry } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

/** yyyy-MM-dd（date 入力欄用） */
function dateInputValue(date: Date | null, timezone: string): string {
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return parts
}

/**
 * 顧客詳細。【MVP 4 / 指示書 8】
 *
 * 上から「今この顧客に何をすべきか」→「対応を記録するボタン」→「情報」の順に置く。
 * 営業マンが迷う余地を作らないため、記録操作は1画面に集約している。
 */
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePageSession()
  const { id } = await params
  const query = await searchParams
  const settings = await getSettings()
  const now = new Date()

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { conversation: true, assignee: true },
  })
  if (!customer) notFound()

  const [followUpLogs, messages, staff, templateRows] = await withReadRetry(() =>

    Promise.all([
      prisma.followUpLog.findMany({
        where: { customerId: id },
        orderBy: { occurredAt: 'desc' },
        take: 50,
        include: { staff: { select: { name: true } } },
      }),
      prisma.message.findMany({
        where: { customerId: id },
        orderBy: { sentAt: 'desc' },
        take: 30,
        include: { sentByStaff: { select: { name: true } } },
      }),
      prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.messageTemplate.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } }),

    ]),

  )

  const displayName = customer.name ?? customer.displayName ?? '（名称未登録）'
  const conv = customer.conversation
  const awaiting = conv?.replyState === ReplyState.AWAITING

  // 顧客情報を差し込んだ候補文を用意する。営業マンは選ぶだけでよい【指示書 9】
  const templates = pickTemplates(templateRows, customer.status).map((t) => ({
    key: t.key,
    title: t.title,
    body: renderTemplate(t.body, {
      name: customer.name ?? customer.displayName,
      assignee: customer.assignee?.name,
      area: customer.desiredArea,
      rent: customer.desiredRent,
    }),
  }))

  const overdue = customer.nextActionAt !== null && customer.nextActionAt.getTime() < now.getTime()

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← 今日やること
        </Link>
        <h1 className="text-xl font-bold">{displayName}</h1>
        <CustomerStatusBadge status={customer.status} />
        <PriorityBadge priority={customer.priority} />
        <span className="text-xs text-slate-500">{PRIORITY_LABEL[customer.priority]}</span>
        {customer.blocked ? <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white">ブロック済み</span> : null}
      </div>

      {/* --- 次にやること。この画面で最も目立つ場所に置く --- */}
      <section className={`card mb-4 border p-4 ${overdue ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500">次回アクション</span>
          <ActionBadge type={customer.nextActionType} />
          <span className="font-medium text-slate-900">{customer.nextActionNote ?? '追客ルールを消化済み。対応を選んでください'}</span>
          <span className={`text-sm ${overdue ? 'font-bold text-red-700' : 'text-slate-600'}`}>
            期限：{formatDateTimeJa(customer.nextActionAt, settings.timezone)}
            {overdue ? '（超過）' : ''}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span>最終接触：{formatDateTimeJa(customer.lastContactAt, settings.timezone)}</span>
          <span>問い合わせ：{formatDateTimeJa(customer.inquiredAt, settings.timezone)}</span>
          <span>経路：{customer.inquirySource ?? '—'}</span>
          <span>担当：{customer.assignee?.name ?? '未設定'}</span>
          {awaiting && conv?.firstUnrepliedAt ? (
            <span className="font-bold text-red-700">
              顧客からのLINEに未返信 <ElapsedBadge minutes={diffMinutes(now, conv.firstUnrepliedAt)} />
            </span>
          ) : null}
          {customer.status === 'CONTRACTED' ? <span>成約金額：{formatYen(customer.contractAmount)}</span> : null}
          {customer.status === 'LOST' ? <span>失注理由：{customer.lostReason ?? '—'}</span> : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-bold">追客履歴</h2>
            {followUpLogs.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">まだ履歴はありません</p>
            ) : (
              <ul className="space-y-2">
                {followUpLogs.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                    <span className="w-32 shrink-0 text-xs text-slate-500">
                      {formatDateTimeJa(log.occurredAt, settings.timezone)}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">
                      {ACTION_TYPE_LABEL[log.actionType]}
                    </span>
                    <span className="text-slate-800">{log.result ?? '—'}</span>
                    {log.statusBefore !== log.statusAfter && log.statusAfter ? (
                      <span className="text-xs text-slate-500">
                        {log.statusBefore ? CUSTOMER_STATUS_LABEL[log.statusBefore] : '—'} →{' '}
                        {CUSTOMER_STATUS_LABEL[log.statusAfter]}
                      </span>
                    ) : null}
                    <span className="text-xs text-slate-500">{log.staff?.name ?? (log.source === 'AUTO' ? 'システム' : '')}</span>
                    {log.note ? <span className="w-full truncate text-xs text-slate-500">{log.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-bold">LINEメッセージ履歴</h2>
            <ul className="space-y-3">
              {messages.length === 0 ? (
                <li className="py-6 text-center text-sm text-slate-500">メッセージはまだありません</li>
              ) : (
                messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-3 text-sm ${
                      m.direction === Direction.INBOUND ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-blue-50 md:ml-12'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {m.direction === Direction.INBOUND
                          ? '顧客'
                          : `担当者${m.sentByStaff?.name ? `（${m.sentByStaff.name}）` : ''}`}
                      </span>
                      <span>{formatDateTimeJa(m.sentAt, settings.timezone)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-slate-800">
                      {m.text ?? (m.messageType === 'manual_resolution' ? '（管理画面で対応済みにしました）' : `[${m.messageType}]`)}
                    </p>
                  </li>
                ))
              )}
            </ul>
            {conv ? (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                未返信リマインドの状態：<StatusBadge status={conv.handlingStatus} /> ／ 送信回数 {conv.reminderCount}回 ／ 次回{' '}
                {formatDateTimeJa(conv.nextReminderAt, settings.timezone)}
              </p>
            ) : null}
          </section>
        </div>

        <div className="space-y-6">
          <FollowUpActions
            customer={{
              id: customer.id,
              status: customer.status,
              hasLine: customer.lineUserId !== null && !customer.blocked,
              phone: customer.phone,
            }}
            templates={templates}
            openComposer={query.compose === '1'}
          />
          <CustomerInfoPanel
            customer={{
              id: customer.id,
              name: customer.name ?? '',
              phone: customer.phone ?? '',
              email: customer.email ?? '',
              assigneeId: customer.assigneeId ?? '',
              inquirySource: customer.inquirySource ?? '',
              desiredArea: customer.desiredArea ?? '',
              desiredRent: customer.desiredRent === null ? '' : String(customer.desiredRent),
              moveInTiming: customer.moveInTiming ?? '',
              moveInBy: dateInputValue(customer.moveInBy, settings.timezone),
              requirements: customer.requirements ?? '',
              note: customer.note ?? '',
              status: customer.status,
              priorityOverride: customer.priorityOverride ?? '',
              autoFollowEnabled: customer.autoFollowEnabled,
            }}
            staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          />
          {customer.lineUserId ? (
            <p className="break-all rounded bg-slate-100 px-3 py-2 font-mono text-[10px] text-slate-500">
              LINE: {customer.lineUserId}
            </p>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}
