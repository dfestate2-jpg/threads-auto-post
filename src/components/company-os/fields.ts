/**
 * 入力フォームの項目定義。
 *
 * 種類ごとにフォーム部品を書くと、同じ「期限」の入力欄が画面ごとに
 * 微妙に違う挙動になる。項目を定義（データ）として持ち、
 * 描画は RecordForm 1つに任せる。
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'datetime'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'tags'
  | 'choices'

export interface FieldSpec {
  name: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  hint?: string
  /** 1行を丸ごと使う（説明文など） */
  full?: boolean
  rows?: number
}

export type FormValues = Record<string, unknown>

/** 初期値を、入力欄が扱える形（文字列・真偽値・配列）にそろえる */
export function toFormValues(fields: FieldSpec[], record: Record<string, unknown> | null): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    const raw = record?.[field.name]
    switch (field.type) {
      case 'checkbox':
        values[field.name] = Boolean(raw)
        break
      case 'tags':
        values[field.name] = Array.isArray(raw) ? (raw as string[]).join('、') : ''
        break
      case 'choices':
        values[field.name] = Array.isArray(raw) ? raw : []
        break
      default:
        values[field.name] = raw === null || raw === undefined ? '' : String(raw)
    }
  }
  return values
}

/** 送信用に変換する。空文字は null にして「未入力」を明示する */
export function toPayload(fields: FieldSpec[], values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of fields) {
    const value = values[field.name]
    switch (field.type) {
      case 'checkbox':
        payload[field.name] = Boolean(value)
        break
      case 'tags':
        payload[field.name] = String(value ?? '')
          .split(/[、,\n]/)
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
        break
      case 'choices':
        payload[field.name] = Array.isArray(value) ? value : []
        break
      case 'number': {
        const text = String(value ?? '').trim()
        payload[field.name] = text.length === 0 ? null : Number(text)
        break
      }
      default: {
        const text = String(value ?? '').trim()
        // 必須項目は空でも文字列のまま送る。null にすると
        // 「入力してください」ではなく型エラーの文言が返ってしまう
        payload[field.name] = text.length === 0 ? (field.required ? '' : null) : text
      }
    }
  }
  return payload
}
