'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { ActionType, CustomerStatus } from '@prisma/client'

export interface ActionCustomer {
  id: string
  status: CustomerStatus
  hasLine: boolean
  phone: string | null
}

export interface ComposerTemplate {
  key: string
  title: string
  /** 顧客情報を差し込み済みの本文 */
  body: string
}

interface ActionButton {
  label: string
  actionType: ActionType
  nextStatus?: CustomerStatus
  result: string
  /** 押し間違いが痛い操作は確認する */
  confirm?: string
  tone?: 'primary' | 'secondary' | 'danger' | 'success'
}

/** 進捗を進めるボタン。押した瞬間にステータス・次回アクション・履歴がすべて更新される */
const PROGRESS_BUTTONS: ActionButton[] = [
  { label: '🏠 物件を提案', actionType: 'PROPOSE', nextStatus: 'PROPOSING', result: '物件を提案' },
  { label: '🧾 見積書を依頼', actionType: 'QUOTE', nextStatus: 'AWAITING_QUOTE', result: '見積書を依頼' },
  { label: '🚗 内見を設定', actionType: 'VIEWING', nextStatus: 'VIEWING_ARRANGING', result: '内見を設定' },
  { label: '✅ 内見が終わった', actionType: 'VIEWING', nextStatus: 'VIEWED', result: '内見実施' },
  { label: '📝 申込検討へ', actionType: 'MEETING', nextStatus: 'APPLICATION_REVIEW', result: '申込を検討中' },
  { label: '📄 申込を受けた', actionType: 'MEETING', nextStatus: 'APPLIED', result: '申込受付' },
]

const CLOSING_BUTTONS: ActionButton[] = [
  { label: '⏸ 保留にする', actionType: 'OTHER', nextStatus: 'ON_HOLD', result: '保留', tone: 'secondary' },
  { label: '💤 休眠にする', actionType: 'OTHER', nextStatus: 'DORMANT', result: '休眠', tone: 'secondary' },
]

/**
 * 顧客画面の大きなアクションボタン。【指示書 8】
 *
 * 営業マンがやるのは「何をしたか」を選ぶことだけ。
 * ステータス・次回追客日・優先度・履歴はすべてシステムが更新する。
 */
export function FollowUpActions({
  customer,
  templates,
  openComposer,
}: {
  customer: ActionCustomer
  templates: ComposerTemplate[]
  openComposer?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [composing, setComposing] = useState(openComposer ?? false)
  const [text, setText] = useState('')
  const [panel, setPanel] = useState<'none' | 'contract' | 'lost'>('none')
  const [amount, setAmount] = useState('')
  const [lostReason, setLostReason] = useState('')

  async function record(body: Record<string, unknown>, okText: string) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/customers/${customer.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? '記録に失敗しました' })
        return false
      }
      setMessage({ type: 'ok', text: okText })
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  function press(button: ActionButton) {
    if (button.confirm && !window.confirm(button.confirm)) return
    void record(
      { actionType: button.actionType, nextStatus: button.nextStatus ?? null, result: button.result },
      `${button.result}として記録しました。次回アクションを更新しました`,
    )
  }

  /** 管理画面からLINEを送る。送信と追客記録が同時に完了する */
  async function sendLine() {
    if (text.trim() === '') return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/customers/${customer.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'LINEの送信に失敗しました' })
        return
      }
      setText('')
      setComposing(false)
      setMessage({ type: 'ok', text: 'LINEを送信し、追客履歴に記録しました' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold">対応を記録する</h2>

      {/* --- 接触の記録。最も使う操作なので最上段に大きく --- */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-primary py-3 text-sm"
          disabled={busy}
          onClick={() => setComposing((v) => !v)}
        >
          💬 LINEする
        </button>
        <a
          className={`btn-primary py-3 text-sm ${customer.phone ? '' : 'pointer-events-none opacity-50'}`}
          href={customer.phone ? `tel:${customer.phone}` : undefined}
        >
          📞 電話する
        </a>
        <button
          className="btn-secondary py-2 text-xs"
          disabled={busy}
          onClick={() => record({ actionType: 'CALL', result: '電話：応答あり' }, '電話の対応を記録しました')}
        >
          電話した（つながった）
        </button>
        <button
          className="btn-secondary py-2 text-xs"
          disabled={busy}
          onClick={() => record({ actionType: 'CALL', result: '電話：不在' }, '不在として記録しました')}
        >
          電話した（不在）
        </button>
      </div>

      {/* --- LINE送信。テンプレートから選ぶだけで文章ができる【指示書 9】 --- */}
      {composing ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-600">
            候補文章（クリックで挿入。そのまま送っても、直してから送ってもかまいません）
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.key}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                onClick={() => setText(t.body)}
              >
                {t.title}
              </button>
            ))}
          </div>
          <textarea
            className="input h-40 resize-y bg-white"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="送信する文章"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-primary text-sm" disabled={busy || !customer.hasLine || text.trim() === ''} onClick={sendLine}>
              LINEを送信する
            </button>
            <button
              className="btn-secondary text-sm"
              disabled={busy}
              onClick={() =>
                record({ actionType: 'LINE', result: 'LINE送信（手元のLINEアプリから）', note: text.slice(0, 500) }, 'LINE送信として記録しました').then(
                  (ok) => {
                    if (ok) {
                      setText('')
                      setComposing(false)
                    }
                  },
                )
              }
            >
              送信済みとして記録
            </button>
            <button className="btn-secondary text-sm" onClick={() => setComposing(false)}>
              閉じる
            </button>
          </div>
          {!customer.hasLine ? (
            <p className="mt-2 text-xs text-orange-600">
              この顧客はLINEが未連携（またはブロック中）のため、画面から送信できません。手元のLINEから送って「送信済みとして記録」を押してください。
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --- 進捗を進める --- */}
      <h3 className="mb-2 mt-4 text-xs font-bold text-slate-500">進捗を進める</h3>
      <div className="grid grid-cols-2 gap-2">
        {PROGRESS_BUTTONS.map((b) => (
          <button key={b.label} className="btn-secondary py-2 text-xs" disabled={busy} onClick={() => press(b)}>
            {b.label}
          </button>
        ))}
      </div>

      {/* --- 決着・保留 --- */}
      <h3 className="mb-2 mt-4 text-xs font-bold text-slate-500">決着・保留</h3>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn py-2 text-xs bg-green-600 text-white hover:bg-green-500" disabled={busy} onClick={() => setPanel('contract')}>
          🎉 成約
        </button>
        <button className="btn-danger py-2 text-xs" disabled={busy} onClick={() => setPanel('lost')}>
          ❌ 失注
        </button>
        {CLOSING_BUTTONS.map((b) => (
          <button key={b.label} className="btn-secondary py-2 text-xs" disabled={busy} onClick={() => press(b)}>
            {b.label}
          </button>
        ))}
      </div>

      {panel === 'contract' ? (
        <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3">
          <label className="label">成約金額（任意・円）</label>
          <input className="input bg-white" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="120000" />
          <div className="mt-2 flex gap-2">
            <button
              className="btn py-2 text-xs bg-green-600 text-white hover:bg-green-500"
              disabled={busy}
              onClick={() =>
                record(
                  {
                    actionType: 'OTHER',
                    nextStatus: 'CONTRACTED',
                    result: '成約',
                    contractAmount: amount ? Number(amount) : null,
                  },
                  '成約として記録しました。追客は終了します',
                ).then((ok) => ok && setPanel('none'))
              }
            >
              成約として確定する
            </button>
            <button className="btn-secondary py-2 text-xs" onClick={() => setPanel('none')}>
              やめる
            </button>
          </div>
        </div>
      ) : null}

      {panel === 'lost' ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3">
          <label className="label">失注理由</label>
          <input className="input bg-white" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="他社で成約 / 引越し中止 など" />
          <div className="mt-2 flex gap-2">
            <button
              className="btn-danger py-2 text-xs"
              disabled={busy}
              onClick={() =>
                record(
                  { actionType: 'OTHER', nextStatus: 'LOST', result: '失注', lostReason: lostReason || null },
                  '失注として記録しました。追客は終了します',
                ).then((ok) => ok && setPanel('none'))
              }
            >
              失注として確定する
            </button>
            <button className="btn-secondary py-2 text-xs" onClick={() => setPanel('none')}>
              やめる
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`mt-3 rounded px-3 py-2 text-sm ${message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  )
}
