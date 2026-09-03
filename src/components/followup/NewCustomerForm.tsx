'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const INQUIRY_SOURCES = ['SUUMO', "HOME'S", 'アットホーム', '自社HP', 'LINE', '電話', '来店', '紹介', 'その他']

/**
 * 顧客登録。【MVP 2 / 指示書 3】
 *
 * 必須はお名前だけ。営業マンに大量入力をさせないため、
 * 残りは分かった時点で顧客画面から足せばよい構成にしている。
 * 登録した瞬間に「新規反響」の追客リズムが始まる。
 */
export function NewCustomerForm({ staff, defaultAssigneeId }: { staff: { id: string; name: string }[]; defaultAssigneeId?: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    lineUserId: '',
    assigneeId: defaultAssigneeId ?? '',
    inquirySource: '',
    desiredArea: '',
    desiredRent: '',
    moveInTiming: '',
    moveInBy: '',
    requirements: '',
    note: '',
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function submit() {
    if (form.name.trim() === '') {
      setError('お名前を入力してください')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          lineUserId: form.lineUserId.trim() || null,
          assigneeId: form.assigneeId || null,
          inquirySource: form.inquirySource || null,
          desiredArea: form.desiredArea.trim() || null,
          desiredRent: form.desiredRent ? Number(form.desiredRent) : null,
          moveInTiming: form.moveInTiming.trim() || null,
          moveInBy: form.moveInBy ? new Date(`${form.moveInBy}T00:00:00+09:00`).toISOString() : null,
          requirements: form.requirements.trim() || null,
          note: form.note.trim() || null,
        }),
      })
      const data = (await res.json()) as { error?: string; customer?: { id: string } }
      if (!res.ok || !data.customer) {
        setError(data.error ?? '登録に失敗しました')
        return
      }
      router.push(`/customers/${data.customer.id}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card max-w-2xl space-y-4 p-4">
      <div>
        <label className="label">お名前（必須）</label>
        <input className="input" value={form.name} onChange={set('name')} placeholder="山田 太郎" autoFocus />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">電話番号</label>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="090-1234-5678" inputMode="tel" />
        </div>
        <div>
          <label className="label">メール</label>
          <input className="input" value={form.email} onChange={set('email')} placeholder="taro@example.com" inputMode="email" />
        </div>
        <div>
          <label className="label">担当営業</label>
          <select className="input" value={form.assigneeId} onChange={set('assigneeId')}>
            <option value="">未設定</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">問い合わせ経路</label>
          <select className="input" value={form.inquirySource} onChange={set('inquirySource')}>
            <option value="">未選択</option>
            {INQUIRY_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">希望エリア</label>
          <input className="input" value={form.desiredArea} onChange={set('desiredArea')} placeholder="世田谷区・三軒茶屋周辺" />
        </div>
        <div>
          <label className="label">希望家賃（円/月）</label>
          <input className="input" value={form.desiredRent} onChange={set('desiredRent')} placeholder="120000" inputMode="numeric" />
        </div>
        <div>
          <label className="label">引越し希望時期</label>
          <input className="input" value={form.moveInTiming} onChange={set('moveInTiming')} placeholder="9月中旬" />
        </div>
        <div>
          <label className="label">
            引越し希望日<span className="ml-1 text-xs font-normal text-slate-500">優先度の自動判定に使います</span>
          </label>
          <input className="input" type="date" value={form.moveInBy} onChange={set('moveInBy')} />
        </div>
      </div>

      <div>
        <label className="label">希望条件</label>
        <textarea className="input h-20 resize-y" value={form.requirements} onChange={set('requirements')} placeholder="2LDK / ペット可 / 駅徒歩10分以内" />
      </div>

      <div>
        <label className="label">
          LINEユーザーID<span className="ml-1 text-xs font-normal text-slate-500">公式LINEで友だちになっている場合</span>
        </label>
        <input className="input font-mono text-xs" value={form.lineUserId} onChange={set('lineUserId')} placeholder="U1234..." />
      </div>

      <div>
        <label className="label">営業メモ</label>
        <textarea className="input h-20 resize-y" value={form.note} onChange={set('note')} />
      </div>

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <button className="btn-primary w-full" onClick={submit} disabled={busy}>
        登録して追客を開始する
      </button>
      <p className="text-center text-xs text-slate-500">
        登録すると「新規反響」として自動追客が始まり、次回アクションが自動で設定されます。
      </p>
    </div>
  )
}
