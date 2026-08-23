import { Direction, ReplyState } from '@prisma/client'
import { notFound } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { CustomerPanel } from '@/components/CustomerPanel'
import { ElapsedBadge, StatusBadge, formatDateTimeJa } from '@/components/ui'
import { requirePageSession } from '@/lib/auth/guard'
import { diffMinutes } from '@/lib/domain/time'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession()
  const { id } = await params
  const settings = await getSettings()
  const now = new Date()

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { conversation: true, assignee: true },
  })
  if (!customer) notFound()

  const [messages, reminders, staff] = await Promise.all([
    prisma.message.findMany({
      where: { customerId: id },
      orderBy: { sentAt: 'desc' },
      take: 50,
      include: { sentByStaff: { select: { name: true } } },
    }),
    prisma.reminder.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])

  const conv = customer.conversation
  const awaiting = conv?.replyState === ReplyState.AWAITING

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{customer.name ?? customer.displayName ?? '（名称未取得）'}</h1>
        {conv ? <StatusBadge status={conv.handlingStatus} /> : null}
        {awaiting && conv?.firstUnrepliedAt ? <ElapsedBadge minutes={diffMinutes(now, conv.firstUnrepliedAt)} /> : null}
        {customer.blocked ? (
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white">ブロック済み</span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-bold">メッセージ履歴</h2>
            <ul className="space-y-3">
              {messages.length === 0 ? (
                <li className="py-6 text-center text-sm text-slate-500">メッセージはまだありません</li>
              ) : (
                messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-3 text-sm ${
                      m.direction === Direction.INBOUND
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-blue-200 bg-blue-50 md:ml-12'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {m.direction === Direction.INBOUND
                          ? '顧客'
                          : `担当者${m.sentByStaff?.name ? `（${m.sentByStaff.name}）` : ''}`}
                        <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">{m.source}</span>
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
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-bold">リマインド送信履歴</h2>
            {reminders.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">送信履歴はありません</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2">日時</th>
                    <th>種別</th>
                    <th>回数</th>
                    <th>未返信</th>
                    <th>結果</th>
                    <th>宛先</th>
                  </tr>
                </thead>
                <tbody>
                  {reminders.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 text-xs">{formatDateTimeJa(r.sentAt ?? r.createdAt, settings.timezone)}</td>
                      <td className="text-xs">{r.kind}</td>
                      <td className="tabular-nums text-xs">{r.sequence}</td>
                      <td className="text-xs">
                        <ElapsedBadge minutes={r.unrepliedMinutes} />
                      </td>
                      <td className="text-xs">
                        <span className={r.status === 'SENT' ? 'text-green-700' : r.status === 'FAILED' ? 'text-red-700' : 'text-slate-500'}>
                          {r.status}
                        </span>
                        {r.error ? <div className="text-[10px] text-red-600">{r.error}</div> : null}
                      </td>
                      <td className="text-xs text-slate-600">
                        {(r.targets as { label?: string }[] | null)?.map((t) => t.label).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <CustomerPanel
            customer={{
              id: customer.id,
              name: customer.name,
              lineUserId: customer.lineUserId,
              displayName: customer.displayName,
              assigneeId: customer.assigneeId,
              reminderIntervalMinutes: customer.reminderIntervalMinutes,
              note: customer.note,
              blocked: customer.blocked,
            }}
            conversation={
              conv
                ? {
                    version: conv.version,
                    handlingStatus: conv.handlingStatus,
                    replyState: conv.replyState,
                    reminderCount: conv.reminderCount,
                    nextReminderAtLabel: formatDateTimeJa(conv.nextReminderAt, settings.timezone),
                    resolvedAtLabel: formatDateTimeJa(conv.resolvedAt, settings.timezone),
                    lastInboundAtLabel: formatDateTimeJa(conv.lastInboundAt, settings.timezone),
                    lastOutboundAtLabel: formatDateTimeJa(conv.lastOutboundAt, settings.timezone),
                  }
                : null
            }
            staff={staff.map((s) => ({ id: s.id, name: s.name }))}
            defaultIntervalMinutes={settings.defaultReminderIntervalMinutes}
          />
        </div>
      </div>
    </AppShell>
  )
}
