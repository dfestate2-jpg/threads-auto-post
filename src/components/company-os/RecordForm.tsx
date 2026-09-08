'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { api } from './api'
import { toFormValues, toPayload, type FieldSpec, type FormValues } from './fields'

/**
 * 汎用の登録・編集フォーム。
 *
 * タスクも課題も決定事項も、入力の形は「項目が並ぶ」だけで同じ。
 * 項目定義（FieldSpec[]）を受け取って描くことで、
 * 保存中の表示・エラー表示・二重送信の防止を全画面で同じにしている。
 */
export function RecordForm({
  fields,
  resource,
  record,
  submitLabel,
  onDone,
  onCancel,
  extraPayload,
}: {
  fields: FieldSpec[]
  resource: string
  /** 編集対象。null なら新規作成 */
  record?: (Record<string, unknown> & { id?: string }) | null
  submitLabel?: string
  onDone?: () => void
  onCancel?: () => void
  /** 常に一緒に送る値（プロジェクトIDなど） */
  extraPayload?: Record<string, unknown>
}) {
  const router = useRouter()
  const [values, setValues] = useState<FormValues>(() => toFormValues(fields, record ?? null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (name: string, value: unknown) => setValues((prev) => ({ ...prev, [name]: value }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)

    const payload = { ...toPayload(fields, values), ...extraPayload }
    const result = record?.id
      ? await api.update(resource, record.id, payload)
      : await api.create(resource, payload)

    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? '保存に失敗しました')
      return
    }
    router.refresh()
    onDone?.()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.name} className={field.full || field.type === 'textarea' || field.type === 'choices' ? 'sm:col-span-2' : ''}>
            <Field field={field} value={values[field.name]} onChange={(v) => set(field.name, v)} />
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2 text-sm" disabled={saving}>
            キャンセル
          </button>
        ) : null}
        <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={saving}>
          {saving ? '保存中…' : (submitLabel ?? (record?.id ? '更新する' : '登録する'))}
        </button>
      </div>
    </form>
  )
}

function Field({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const id = `field-${field.name}`
  const label = (
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
      {field.label}
      {field.required ? <span className="ml-1 text-red-500">*</span> : null}
    </label>
  )
  const hint = field.hint ? <p className="mt-1 text-xs leading-relaxed text-slate-400">{field.hint}</p> : null
  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500'

  if (field.type === 'checkbox') {
    return (
      <div className="flex h-full items-center gap-2 pt-5">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <label htmlFor={id} className="text-sm text-slate-700">
          {field.label}
        </label>
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        {label}
        <select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {!field.required ? <option value="">（未設定）</option> : null}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hint}
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          id={id}
          value={String(value ?? '')}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} leading-relaxed`}
        />
        {hint}
      </div>
    )
  }

  if (field.type === 'choices') {
    return <ChoicesField field={field} value={value} onChange={onChange} />
  }

  const type =
    field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : field.type === 'number' ? 'text' : 'text'

  return (
    <div>
      {label}
      <input
        id={id}
        type={type}
        inputMode={field.type === 'number' ? 'numeric' : undefined}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      {hint}
    </div>
  )
}

interface Choice {
  label: string
  pros: string
  cons: string
}

/**
 * 未決事項の選択肢（案・メリット・デメリット）。
 * 並べて比べられないと「どれが良いか」を判断できないので、専用の入力にしている。
 */
function ChoicesField({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const choices: Choice[] = Array.isArray(value)
    ? (value as Choice[]).map((c) => ({ label: c?.label ?? '', pros: c?.pros ?? '', cons: c?.cons ?? '' }))
    : []

  const update = (index: number, patch: Partial<Choice>) => {
    const next = choices.map((c, i) => (i === index ? { ...c, ...patch } : c))
    onChange(next)
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500'

  return (
    <div>
      <p className="mb-1 block text-xs font-medium text-slate-600">{field.label}</p>
      <div className="space-y-2">
        {choices.map((choice, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <input
                value={choice.label}
                placeholder={`案${index + 1}`}
                onChange={(e) => update(index, { label: e.target.value })}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => onChange(choices.filter((_, i) => i !== index))}
                className="shrink-0 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-200"
                aria-label={`案${index + 1}を削除`}
              >
                削除
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={choice.pros}
                placeholder="メリット"
                onChange={(e) => update(index, { pros: e.target.value })}
                className={inputClass}
              />
              <input
                value={choice.cons}
                placeholder="デメリット"
                onChange={(e) => update(index, { cons: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...choices, { label: '', pros: '', cons: '' }])}
        className="btn-secondary mt-2 px-3 py-1.5 text-xs"
      >
        ＋ 選択肢を追加
      </button>
      {field.hint ? <p className="mt-1 text-xs text-slate-400">{field.hint}</p> : null}
    </div>
  )
}
